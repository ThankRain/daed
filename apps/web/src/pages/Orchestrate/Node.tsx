import type { QRCodeModalRef } from '~/components/QRCodeModal.tsx'
import type { NodesQuery } from '~/schemas/gql/graphql.ts'
import { Droppable } from '@hello-pangea/dnd'
import { Cloud, CloudUpload, Eye, FileInput, Pencil, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImportNodesMutation, useRemoveNodesMutation, useTestNodesLatencyMutation } from '~/apis/index.ts'
import { EditNodeFormModal } from '~/components/EditNodeFormModal.tsx'
import { ImportResourceFormModal } from '~/components/ImportResourceFormModal.tsx'
import { ConfigureNodeFormModal, SortableNodeCard } from '~/components/index.ts'
import { QRCodeModal } from '~/components/QRCodeModal.tsx'
import { Section } from '~/components/Section.tsx'
import { Badge } from '~/components/ui/badge.tsx'
import { Button } from '~/components/ui/button.tsx'
import { SimpleTooltip } from '~/components/ui/tooltip.tsx'
import { cn } from '~/lib/utils'

export const NODE_DROPPABLE_ID = 'node-list'

interface NodeLatencyState {
  checkedAt: number
  errorMsg?: string | null
  latencyMs: number
  testUrl: string
}

export function NodeResource({
  sortedNodes,
  highlight,
}: {
  sortedNodes: NodesQuery['nodes']['edges']
  highlight?: boolean
}) {
  const { t } = useTranslation()

  const [openedQRCodeModal, setOpenedQRCodeModal] = useState(false)
  const [openedImportNodeFormModal, setOpenedImportNodeFormModal] = useState(false)
  const [openedConfigureNodeFormModal, setOpenedConfigureNodeFormModal] = useState(false)
  const [openedEditNodeFormModal, setOpenedEditNodeFormModal] = useState(false)
  const [editingNode, setEditingNode] = useState<{
    id: string
    link: string
    tag: string
    name: string
  }>()
  const qrCodeModalRef = useRef<QRCodeModalRef>(null)
  const removeNodesMutation = useRemoveNodesMutation()
  const importNodesMutation = useImportNodesMutation()
  const testNodesLatencyMutation = useTestNodesLatencyMutation()
  const [latencyResults, setLatencyResults] = useState<Record<string, NodeLatencyState>>({})
  const [pendingNodeIds, setPendingNodeIds] = useState<string[]>([])
  const isCheckingRef = useRef(false)

  const updateLatencyResults = useCallback(
    (
      results: Array<{
        id: string
        latencyMs: number
        errorMsg?: string | null
        testUrl: string
      }>,
    ) => {
      const checkedAt = Date.now()
      setLatencyResults((current) => {
        const next = { ...current }
        for (const result of results) {
          next[result.id] = {
            checkedAt,
            errorMsg: result.errorMsg,
            latencyMs: result.latencyMs,
            testUrl: result.testUrl,
          }
        }
        return next
      })
    },
    [],
  )

  const checkNodeLatencies = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0 || isCheckingRef.current) {
        return
      }

      isCheckingRef.current = true
      setPendingNodeIds((current) => Array.from(new Set([...current, ...ids])))

      try {
        const data = await testNodesLatencyMutation.mutateAsync({ ids })
        updateLatencyResults(data.testNodesLatency)
      } finally {
        isCheckingRef.current = false
        setPendingNodeIds((current) => current.filter((id) => !ids.includes(id)))
      }
    },
    [testNodesLatencyMutation, updateLatencyResults],
  )

  useEffect(() => {
    const ids = sortedNodes.map((node) => node.id)
    if (ids.length === 0) {
      return
    }

    void checkNodeLatencies(ids)

    const timer = window.setInterval(() => {
      void checkNodeLatencies(ids)
    }, 30000)

    return () => window.clearInterval(timer)
  }, [checkNodeLatencies, sortedNodes])

  return (
    <Section
      title={t('node')}
      icon={<Cloud className="h-5 w-5" />}
      iconPlus={<CloudUpload className="h-4 w-4" />}
      onCreate={() => setOpenedImportNodeFormModal(true)}
      actions={
        <Fragment>
          <SimpleTooltip label={t('actions.checkAllLatencies')}>
            <Button
              variant="ghost"
              size="icon"
              loading={testNodesLatencyMutation.isPending}
              onClick={() => {
                void checkNodeLatencies(sortedNodes.map((node) => node.id))
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip label={t('actions.configureNode')}>
            <Button variant="ghost" size="icon" onClick={() => setOpenedConfigureNodeFormModal(true)}>
              <FileInput className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        </Fragment>
      }
      bordered
      highlight={highlight}
    >
      <Droppable droppableId={NODE_DROPPABLE_ID} type="NODE">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn('flex flex-col gap-3 min-h-[100px]', snapshot.isDraggingOver && 'bg-primary/5 rounded-lg')}
          >
            {sortedNodes.map(({ id, name, tag, protocol, link }, index) => (
              <SortableNodeCard
                key={id}
                id={`node-${id}`}
                index={index}
                name={tag || name}
                leftSection={protocol}
                status={
                  <NodeLatencyBadge
                    result={latencyResults[id]}
                    pending={pendingNodeIds.includes(id)}
                    t={t}
                  />
                }
                actions={
                  <Fragment>
                    <SimpleTooltip label={t('actions.checkLatency')}>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          void checkNodeLatencies([id])
                        }}
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', pendingNodeIds.includes(id) && 'animate-spin')} />
                      </Button>
                    </SimpleTooltip>
                    <SimpleTooltip label={t('actions.edit')}>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingNode({
                            id,
                            link,
                            tag: tag || '',
                            name: name || '',
                          })
                          setOpenedEditNodeFormModal(true)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </SimpleTooltip>
                    <SimpleTooltip label={t('actions.viewQRCode')}>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          qrCodeModalRef.current?.setProps({
                            name: tag || name!,
                            link,
                          })
                          setOpenedQRCodeModal(true)
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </SimpleTooltip>
                  </Fragment>
                }
                onRemove={() => removeNodesMutation.mutate([id])}
              >
                {name && name !== tag && <p className="text-xs opacity-70">{name}</p>}
                <NodeLatencySummary result={latencyResults[id]} pending={pendingNodeIds.includes(id)} t={t} />
                <Spoiler label={link} showLabel={t('actions.show sensitive')} hideLabel={t('actions.hide')} />
              </SortableNodeCard>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      <QRCodeModal ref={qrCodeModalRef} opened={openedQRCodeModal} onClose={() => setOpenedQRCodeModal(false)} />

      <ImportResourceFormModal
        title={t('node')}
        opened={openedImportNodeFormModal}
        onClose={() => setOpenedImportNodeFormModal(false)}
        handleSubmit={async (values) => {
          await importNodesMutation.mutateAsync(values.resources.map(({ link, tag }) => ({ link, tag })))
        }}
      />

      <ConfigureNodeFormModal
        opened={openedConfigureNodeFormModal}
        onClose={() => setOpenedConfigureNodeFormModal(false)}
      />

      <EditNodeFormModal
        opened={openedEditNodeFormModal}
        onClose={() => setOpenedEditNodeFormModal(false)}
        node={editingNode}
      />
    </Section>
  )
}

function NodeLatencyBadge({
  pending,
  result,
  t,
}: {
  pending: boolean
  result?: NodeLatencyState
  t: ReturnType<typeof useTranslation>['t']
}) {
  if (pending) {
    return (
      <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary">
        <RefreshCw className="h-3 w-3 animate-spin" />
        {t('latency.checking')}
      </Badge>
    )
  }

  if (!result) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <WifiOff className="h-3 w-3" />
        {t('latency.notChecked')}
      </Badge>
    )
  }

  if (result.errorMsg || result.latencyMs < 0) {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/5 text-destructive">
        <WifiOff className="h-3 w-3" />
        {t('latency.failed')}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
      <Wifi className="h-3 w-3" />
      {result.latencyMs}
      {t('milliseconds')}
    </Badge>
  )
}

function NodeLatencySummary({
  pending,
  result,
  t,
}: {
  pending: boolean
  result?: NodeLatencyState
  t: ReturnType<typeof useTranslation>['t']
}) {
  if (!result && !pending) {
    return null
  }

  return (
    <div className="mb-2 space-y-1">
      <p className="text-xs">
        {pending ? t('latency.monitoring') : `${t('latency.lastChecked')}: ${new Date(result!.checkedAt).toLocaleTimeString()}`}
      </p>
      {result?.testUrl && <p className="text-xs break-all opacity-70">{result.testUrl}</p>}
      {result?.errorMsg && <p className="text-xs text-destructive break-all">{result.errorMsg}</p>}
    </div>
  )
}

function Spoiler({ label, showLabel, hideLabel }: { label: string; showLabel: string; hideLabel: string }) {
  const [show, setShow] = useState(false)

  return (
    <div>
      {show && <p className="text-sm break-all">{label}</p>}
      <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShow(!show)}>
        {show ? hideLabel : showLabel}
      </button>
    </div>
  )
}
