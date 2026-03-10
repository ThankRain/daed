/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (c) 2023, daeuniverse Organization <team@v2raya.org>
 */

package node

import (
	"context"
	"fmt"
	"net/http"
	"net/netip"
	"net/url"
	"time"

	"github.com/daeuniverse/dae-wing/common"
	"github.com/daeuniverse/dae-wing/db"
	"github.com/daeuniverse/dae/common/netutils"
	"github.com/daeuniverse/dae/component/outbound/dialer"
	outboundDialer "github.com/daeuniverse/outbound/dialer"
	"github.com/daeuniverse/outbound/protocol/direct"
	"github.com/graph-gophers/graphql-go"
)

type LatencyTestResult struct {
	NodeID  graphql.ID
	Latency int32 // milliseconds, -1 means timeout/error
	Error   *string
	TestURL string
}

func (r *LatencyTestResult) ID() graphql.ID {
	return r.NodeID
}

func (r *LatencyTestResult) LatencyMs() int32 {
	return r.Latency
}

func (r *LatencyTestResult) ErrorMsg() *string {
	return r.Error
}

func (r *LatencyTestResult) TestUrl() string {
	return r.TestURL
}

// testNodeLatencyWithLink tests the latency of a node using its link
func testNodeLatencyWithLink(ctx context.Context, nodeID graphql.ID, link string, testURL string) (*LatencyTestResult, error) {
	// Use default test URL if not provided
	if testURL == "" {
		testURL = "http://cp.cloudflare.com"
	}

	// Parse URL
	parsedURL, err := url.Parse(testURL)
	if err != nil {
		errMsg := fmt.Sprintf("invalid test URL: %v", err)
		return &LatencyTestResult{
			NodeID:  nodeID,
			Latency: -1,
			Error:   &errMsg,
			TestURL: testURL,
		}, nil
	}

	// Create a temporary dialer from link
	gOption := &dialer.GlobalOption{
		Log:         nil, // Will use default logger
		ExtraOption: outboundDialer.ExtraOption{},
	}
	iOption := dialer.InstanceOption{
		DisableCheck: true, // We will do manual check
	}

	d, err := dialer.NewFromLink(gOption, iOption, link, "")
	if err != nil {
		errMsg := fmt.Sprintf("failed to create dialer: %v", err)
		return &LatencyTestResult{
			NodeID:  nodeID,
			Latency: -1,
			Error:   &errMsg,
			TestURL: testURL,
		}, nil
	}

	// Resolve IP
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	systemDns, err := netutils.SystemDns()
	if err != nil {
		errMsg := fmt.Sprintf("failed to get system DNS: %v", err)
		return &LatencyTestResult{
			NodeID:  nodeID,
			Latency: -1,
			Error:   &errMsg,
			TestURL: testURL,
		}, nil
	}

	ip46, err4, err6 := netutils.ResolveIp46(ctx, direct.SymmetricDirect, systemDns, parsedURL.Hostname(), "udp", false)
	if !ip46.Ip4.IsValid() && !ip46.Ip6.IsValid() {
		errMsg := fmt.Sprintf("failed to resolve IP: ipv4=%v, ipv6=%v", err4, err6)
		return &LatencyTestResult{
			NodeID:  nodeID,
			Latency: -1,
			Error:   &errMsg,
			TestURL: testURL,
		}, nil
	}

	// Use IPv4 if available, otherwise IPv6
	var ip netip.Addr
	if ip46.Ip4.IsValid() {
		ip = ip46.Ip4
	} else {
		ip = ip46.Ip6
	}

	// Perform HTTP check
	start := time.Now()
	u := &netutils.URL{URL: parsedURL}
	ok, checkErr := d.HttpCheck(ctx, u, ip, http.MethodHead, 0, false)
	latency := int32(time.Since(start).Milliseconds())

	if !ok || checkErr != nil {
		errMsg := fmt.Sprintf("connection failed: %v", checkErr)
		return &LatencyTestResult{
			NodeID:  nodeID,
			Latency: -1,
			Error:   &errMsg,
			TestURL: testURL,
		}, nil
	}

	return &LatencyTestResult{
		NodeID:  nodeID,
		Latency: latency,
		Error:   nil,
		TestURL: testURL,
	}, nil
}

// TestNodeLatency tests the latency of a single node
func TestNodeLatency(ctx context.Context, nodeID graphql.ID, testURL string) (*LatencyTestResult, error) {
	id, err := common.DecodeCursor(nodeID)
	if err != nil {
		return nil, err
	}

	// Get node from database
	var node db.Node
	if err := db.DB(ctx).Model(&db.Node{}).Where("id = ?", id).First(&node).Error; err != nil {
		return nil, fmt.Errorf("node not found: %w", err)
	}

	return testNodeLatencyWithLink(ctx, nodeID, node.Link, testURL)
}

// TestNodesLatency tests latency for multiple nodes
func TestNodesLatency(ctx context.Context, nodeIDs []graphql.ID, testURL string) ([]*LatencyTestResult, error) {
	var results []*LatencyTestResult

	for _, id := range nodeIDs {
		result, err := TestNodeLatency(ctx, id, testURL)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}

	return results, nil
}
