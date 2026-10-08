'use client'

import {
  ChevronLeft,
  ChevronRight,
  Download,
} from 'lucide-react'
import {
  useId,
  useMemo,
  useState,
} from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts'
import { Panel } from '@/components/page/panel'
import { SimpleSelect } from '@/components/page/simple-select'
import { Button } from '@/components/ui/button'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { formatNumber } from '@/lib/format'
import type { ProjectUsageSummary } from '@/lib/usage/project-usage-service'
import { cn } from '@/lib/utils'

const PARTICIPANT_MINUTE_LIMIT = 5_000

type Period = '7d' | '14d'

type BreakdownKey =
  | 'audio'
  | 'video'
  | 'sfu'
  | 'turn'

interface UsageBucket {
  bucket: string
  participantSeconds: number
  roomsCreated: number
}

const periodOptions = [
  {
    value: '7d',
    label: 'Last 7 days',
  },
  {
    value: '14d',
    label: 'Last 14 days',
  },
]

const breakdownTabs: {
  key: BreakdownKey
  label: string
}[] = [
  {
    key: 'audio',
    label: 'Audio',
  },
  {
    key: 'video',
    label: 'Video',
  },
  {
    key: 'sfu',
    label: 'SFU',
  },
  {
    key: 'turn',
    label: 'TURN',
  },
]

function formatGb(bytes: number) {
  if (bytes <= 0) {
    return '0 GB'
  }

  const gb = bytes / 1024 ** 3

  if (gb < 0.01) {
    return `${gb.toFixed(3)} GB`
  }

  if (gb < 10) {
    return `${gb.toFixed(2)} GB`
  }

  return `${gb.toFixed(1)} GB`
}

function formatMinutes(seconds: number) {
  return Math.round(seconds / 60)
}

function formatPercent(value: number) {
  return `${Math.min(Math.max(value, 0), 100).toFixed(
    value > 0 && value < 10 ? 1 : 0,
  )}%`
}

function FilterField({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="shrink-0 text-sm text-muted-foreground"
      >
        {label}
      </label>

      {children}
    </div>
  )
}

export function ProjectUsageDashboard({
  projectId,
  summary,
  buckets,
}: {
  projectId: string
  summary: ProjectUsageSummary
  buckets: UsageBucket[]
}) {
  const periodId = useId()

  const [period, setPeriod] = useState<Period>('7d')
  const [offset, setOffset] = useState(0)
  const [tab, setTab] =
    useState<BreakdownKey>('audio')

  const days = period === '7d' ? 7 : 14

  const selectedBuckets = useMemo(() => {
    const end =
      buckets.length - offset * days

    const start = Math.max(
      0,
      end - days,
    )

    return buckets.slice(
      Math.max(0, start),
      Math.max(0, end),
    )
  }, [
    buckets,
    days,
    offset,
  ])

  const participantMinutes = useMemo(
    () =>
      selectedBuckets.reduce(
        (total, bucket) =>
          total +
          bucket.participantSeconds / 60,
        0,
      ),
    [selectedBuckets],
  )

  const consumedPercent =
    PARTICIPANT_MINUTE_LIMIT > 0
      ? (participantMinutes /
          PARTICIPANT_MINUTE_LIMIT) *
        100
      : 0

  const chartData = useMemo(
    () =>
      selectedBuckets.map((bucket) => {
        const minutes =
          bucket.participantSeconds / 60

        return {
          label: new Date(
            bucket.bucket,
          ).toLocaleDateString('en', {
            month: 'short',
            day: 'numeric',
          }),
          consumed:
            (minutes /
              PARTICIPANT_MINUTE_LIMIT) *
            100,
          minutes,
        }
      }),
    [selectedBuckets],
  )

  const chartConfig = {
    consumed: {
      label: 'Consumed',
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig

  const participantConfig = {
    value: {
      label: 'Participant minutes',
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig

  const sessionsConfig = {
    value: {
      label: 'Sessions',
      color: 'var(--chart-2)',
    },
  } satisfies ChartConfig

  const participantBars = selectedBuckets.map(
    (bucket) => ({
      label: new Date(
        bucket.bucket,
      ).toLocaleDateString('en', {
        month: 'short',
        day: 'numeric',
      }),
      value: Math.round(
        bucket.participantSeconds / 60,
      ),
    }),
  )

  const sessionsBars =
    selectedBuckets.map(
      (bucket) => ({
        label: new Date(
          bucket.bucket,
        ).toLocaleDateString('en', {
          month: 'short',
          day: 'numeric',
        }),
        value: bucket.roomsCreated,
      }),
    )

  const totalNetworkBytes =
    summary.sfuIngressBytes +
    summary.sfuEgressBytes +
    summary.turnIngressBytes +
    summary.turnEgressBytes

  const audioMinutes =
    summary.audioParticipantSeconds / 60

  const videoMinutes =
    summary.videoParticipantSeconds / 60

  const totalMediaMinutes =
    audioMinutes + videoMinutes

  const breakdown = {
    audio: {
      label: 'Audio',
      value: audioMinutes,
      valueFormatted: `${formatNumber(
        Math.round(audioMinutes),
      )} min`,
      consumed:
        totalMediaMinutes > 0
          ? (audioMinutes /
              totalMediaMinutes) *
            100
          : 0,
      unit: 'Minutes',
      rows: [
        {
          label:
            'Audio participant time',
          quantity: `${formatNumber(
            Math.round(audioMinutes),
          )} min`,
          consumed:
            totalMediaMinutes > 0
              ? (audioMinutes /
                  totalMediaMinutes) *
                100
              : 0,
        },
      ],
    },

    video: {
      label: 'Video',
      value: videoMinutes,
      valueFormatted: `${formatNumber(
        Math.round(videoMinutes),
      )} min`,
      consumed:
        totalMediaMinutes > 0
          ? (videoMinutes /
              totalMediaMinutes) *
            100
          : 0,
      unit: 'Minutes',
      rows: [
        {
          label:
            'Video participant time',
          quantity: `${formatNumber(
            Math.round(videoMinutes),
          )} min`,
          consumed:
            totalMediaMinutes > 0
              ? (videoMinutes /
                  totalMediaMinutes) *
                100
              : 0,
        },
      ],
    },

    sfu: {
      label: 'SFU',
      value:
        summary.sfuIngressBytes +
        summary.sfuEgressBytes,
      valueFormatted: formatGb(
        summary.sfuIngressBytes +
          summary.sfuEgressBytes,
      ),
      consumed:
        totalNetworkBytes > 0
          ? ((summary.sfuIngressBytes +
              summary.sfuEgressBytes) /
              totalNetworkBytes) *
            100
          : 0,
      unit: 'Data',
      rows: [
        {
          label: 'Ingress',
          quantity: formatGb(
            summary.sfuIngressBytes,
          ),
          consumed:
            totalNetworkBytes > 0
              ? (summary.sfuIngressBytes /
                  totalNetworkBytes) *
                100
              : 0,
        },
        {
          label: 'Egress',
          quantity: formatGb(
            summary.sfuEgressBytes,
          ),
          consumed:
            totalNetworkBytes > 0
              ? (summary.sfuEgressBytes /
                  totalNetworkBytes) *
                100
              : 0,
        },
      ],
    },

    turn: {
      label: 'TURN',
      value:
        summary.turnIngressBytes +
        summary.turnEgressBytes,
      valueFormatted: formatGb(
        summary.turnIngressBytes +
          summary.turnEgressBytes,
      ),
      consumed:
        totalNetworkBytes > 0
          ? ((summary.turnIngressBytes +
              summary.turnEgressBytes) /
              totalNetworkBytes) *
            100
          : 0,
      unit: 'Data',
      rows: [
        {
          label: 'Ingress',
          quantity: formatGb(
            summary.turnIngressBytes,
          ),
          consumed:
            totalNetworkBytes > 0
              ? (summary.turnIngressBytes /
                  totalNetworkBytes) *
                100
              : 0,
        },
        {
          label: 'Egress',
          quantity: formatGb(
            summary.turnEgressBytes,
          ),
          consumed:
            totalNetworkBytes > 0
              ? (summary.turnEgressBytes /
                  totalNetworkBytes) *
                100
              : 0,
        },
      ],
    },
  } satisfies Record<
    BreakdownKey,
    {
      label: string
      value: number
      valueFormatted: string
      consumed: number
      unit: string
      rows: {
        label: string
        quantity: string
        consumed: number
      }[]
    }
  >

  const activeBreakdown =
    breakdown[tab]

  const rangeLabel = useMemo(() => {
    if (selectedBuckets.length === 0) {
      return 'No data'
    }

    const first =
      selectedBuckets[0]
    const last =
      selectedBuckets[
        selectedBuckets.length - 1
      ]

    if (!first || !last) {
      return 'No data'
    }

    const start = new Date(
      first.bucket,
    ).toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
    })

    const end = new Date(
      last.bucket,
    ).toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
    })

    return `${start} – ${end}`
  }, [selectedBuckets])

  const maxOffset = Math.max(
    0,
    Math.ceil(buckets.length / days) -
      1,
  )

  function handleExport() {
    const rows = [
      [
        'date',
        'participant_minutes',
        'consumed_percent',
      ],
      ...chartData.map((item) => [
        item.label,
        item.minutes.toFixed(2),
        item.consumed.toFixed(2),
      ]),
    ]

    const csv = rows
      .map((row) =>
        row
          .map((value) =>
            `"${String(value).replace(
              /"/g,
              '""',
            )}"`,
          )
          .join(','),
      )
      .join('\n')

    const blob = new Blob(
      [csv],
      {
        type: 'text/csv;charset=utf-8',
      },
    )

    const url =
      URL.createObjectURL(blob)

    const anchor =
      document.createElement('a')

    anchor.href = url
    anchor.download = `usage-${projectId}.csv`

    document.body.appendChild(
      anchor,
    )

    anchor.click()
    anchor.remove()

    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          <FilterField
            label="Media"
            id="media-type"
          >
            <div className="flex h-9 items-center rounded-full border bg-background px-3.5 text-sm">
              Media type
            </div>
          </FilterField>

          <FilterField
            label="Period"
            id={periodId}
          >
            <SimpleSelect
              id={periodId}
              value={period}
              onValueChange={(
                value,
              ) => {
                setPeriod(
                  value as Period,
                )
                setOffset(0)
              }}
              options={periodOptions}
              size="sm"
              className="w-fit"
            />
          </FilterField>
        </div>

        <div className="flex items-center justify-between gap-1 sm:justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous period"
            disabled={
              offset >= maxOffset
            }
            onClick={() =>
              setOffset((current) =>
                Math.min(
                  current + 1,
                  maxOffset,
                ),
              )
            }
          >
            <ChevronLeft />
          </Button>

          <span
            className="min-w-0 px-2 text-center text-sm tabular-nums"
            aria-live="polite"
          >
            {rangeLabel}
          </span>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next period"
            disabled={offset === 0}
            onClick={() =>
              setOffset((current) =>
                Math.max(
                  current - 1,
                  0,
                ),
              )
            }
          >
            <ChevronRight />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Download CSV"
            onClick={handleExport}
          >
            <Download />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel className="flex flex-col">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Consumed</span>

            <span>{period}</span>
          </div>

          <p className="text-2xl tracking-tight tabular-nums sm:text-[1.75rem]">
            {formatPercent(
              consumedPercent,
            )}
          </p>

          <ChartContainer
            config={chartConfig}
            className="mt-4 h-64 w-full sm:h-72"
          >
            <BarChart
              data={chartData}
              margin={{
                left: 0,
                right: 0,
                top: 4,
              }}
            >
              <CartesianGrid
                vertical={false}
              />

              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
              />

              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={(
                  value,
                ) => `${value}%`}
              />

              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(
                      value,
                    ) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          Consumed
                        </span>

                        <span className="font-mono tabular-nums">
                          {formatPercent(
                            Number(
                              value ??
                                0,
                            ),
                          )}
                        </span>
                      </div>
                    )}
                  />
                }
              />

              <Bar
                dataKey="consumed"
                fill="var(--color-consumed)"
                radius={[
                  4,
                  4,
                  0,
                  0,
                ]}
              />
            </BarChart>
          </ChartContainer>
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <CountPanel
            title="Participant minutes"
            period={period}
            total={formatNumber(
              Math.round(
                participantMinutes,
              ),
            )}
            data={participantBars}
            config={
              participantConfig
            }
          />

          <CountPanel
            title="Sessions"
            period="total"
            total={formatNumber(
              summary.signalingConnections,
            )}
            data={sessionsBars}
            config={sessionsConfig}
          />
        </div>
      </div>

      <section
        aria-labelledby="network-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2
            id="network-heading"
            className="text-xl font-normal tracking-tight"
          >
            Network traffic
          </h2>

          <p className="text-sm text-muted-foreground">
            {formatGb(
              totalNetworkBytes,
            )}{' '}
            transferred
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CountPanel
            title="SFU ingress"
            period="total"
            total={formatGb(
              summary.sfuIngressBytes,
            )}
            data={[
              {
                label: 'SFU ingress',
                value:
                  summary.sfuIngressBytes /
                  1024 ** 3,
              },
            ]}
            config={{
              value: {
                label: 'SFU ingress',
                color:
                  'var(--chart-2)',
              },
            }}
            valueFormatter={(
              value,
            ) =>
              `${value.toFixed(
                value < 10
                  ? 2
                  : 1,
              )} GB`
            }
          />

          <CountPanel
            title="SFU egress"
            period="total"
            total={formatGb(
              summary.sfuEgressBytes,
            )}
            data={[
              {
                label: 'SFU egress',
                value:
                  summary.sfuEgressBytes /
                  1024 ** 3,
              },
            ]}
            config={{
              value: {
                label: 'SFU egress',
                color:
                  'var(--chart-3)',
              },
            }}
            valueFormatter={(
              value,
            ) =>
              `${value.toFixed(
                value < 10
                  ? 2
                  : 1,
              )} GB`
            }
          />

          <CountPanel
            title="TURN ingress"
            period="total"
            total={formatGb(
              summary.turnIngressBytes,
            )}
            data={[
              {
                label:
                  'TURN ingress',
                value:
                  summary.turnIngressBytes /
                  1024 ** 3,
              },
            ]}
            config={{
              value: {
                label:
                  'TURN ingress',
                color:
                  'var(--chart-5)',
              },
            }}
            valueFormatter={(
              value,
            ) =>
              `${value.toFixed(
                value < 10
                  ? 2
                  : 1,
              )} GB`
            }
          />

          <CountPanel
            title="TURN egress"
            period="total"
            total={formatGb(
              summary.turnEgressBytes,
            )}
            data={[
              {
                label:
                  'TURN egress',
                value:
                  summary.turnEgressBytes /
                  1024 ** 3,
              },
            ]}
            config={{
              value: {
                label:
                  'TURN egress',
                color:
                  'var(--chart-6)',
              },
            }}
            valueFormatter={(
              value,
            ) =>
              `${value.toFixed(
                value < 10
                  ? 2
                  : 1,
              )} GB`
            }
          />
        </div>
      </section>

      <section
        aria-labelledby="breakdown-heading"
        className="flex flex-col gap-4"
      >
        <h2
          id="breakdown-heading"
          className="text-xl font-normal tracking-tight"
        >
          Breakdown
        </h2>

        <div
          role="tablist"
          aria-label="Usage breakdown"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          {breakdownTabs.map(
            (item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={
                  tab ===
                  item.key
                }
                aria-controls="breakdown-panel"
                onClick={() =>
                  setTab(
                    item.key,
                  )
                }
                className={cn(
                  'inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm transition-colors',
                  tab ===
                    item.key
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ),
          )}
        </div>

        <Panel
          id="breakdown-panel"
          role="tabpanel"
          className="grid gap-6 md:grid-cols-2"
        >
          <div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {
                  activeBreakdown.label
                }
              </span>

              <span>
                Consumed
              </span>
            </div>

            <p className="text-2xl tracking-tight tabular-nums sm:text-[1.75rem]">
              {formatPercent(
                activeBreakdown.consumed,
              )}
            </p>

            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              {
                activeBreakdown.valueFormatted
              }
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th
                    scope="col"
                    className="pb-2 text-left font-normal"
                  >
                    Type
                  </th>

                  <th
                    scope="col"
                    className="pb-2 text-right font-normal"
                  >
                    {
                      activeBreakdown.unit
                    }
                  </th>

                  <th
                    scope="col"
                    className="pb-2 text-right font-normal"
                  >
                    Consumed
                  </th>
                </tr>
              </thead>

              <tbody>
                {activeBreakdown.rows.map(
                  (row) => (
                    <tr
                      key={
                        row.label
                      }
                      className="border-b"
                    >
                      <td className="py-2.5">
                        {
                          row.label
                        }
                      </td>

                      <td className="py-2.5 text-right tabular-nums">
                        {
                          row.quantity
                        }
                      </td>

                      <td className="py-2.5 text-right tabular-nums">
                        {formatPercent(
                          row.consumed,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>

              <tfoot>
                <tr className="font-medium">
                  <th
                    scope="row"
                    className="pt-2.5 text-left font-medium"
                  >
                    Total
                  </th>

                  <td className="pt-2.5 text-right tabular-nums">
                    {
                      activeBreakdown.valueFormatted
                    }
                  </td>

                  <td className="pt-2.5 text-right tabular-nums">
                    {formatPercent(
                      activeBreakdown.consumed,
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      </section>
    </div>
  )
}

function CountPanel({
  title,
  period,
  total,
  data,
  config,
  valueFormatter,
}: {
  title: string
  period: string
  total: number | string
  data: {
    label: string
    value: number
  }[]
  config: ChartConfig
  valueFormatter?: (
    value: number,
  ) => string
}) {
  const tooltipContent =
    valueFormatter ? (
      <ChartTooltipContent
        hideLabel={false}
        formatter={(value) => (
          <span className="font-mono tabular-nums">
            {valueFormatter(
              Number(
                value ?? 0,
              ),
            )}
          </span>
        )}
      />
    ) : (
      <ChartTooltipContent
        hideLabel={false}
      />
    )

  return (
    <Panel className="flex flex-col">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{title}</span>
        <span>{period}</span>
      </div>

      <p className="text-2xl tracking-tight tabular-nums sm:text-[1.75rem]">
        {typeof total ===
        'number'
          ? formatNumber(
              total,
            )
          : total}
      </p>

      <ChartContainer
        config={config}
        className="mt-3 h-24 w-full"
      >
        <BarChart
          data={data}
          margin={{
            left: 0,
            right: 0,
            top: 4,
            bottom: 0,
          }}
        >
          <XAxis
            dataKey="label"
            hide
          />

          <ChartTooltip
            content={
              tooltipContent
            }
          />

          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={[
              3,
              3,
              0,
              0,
            ]}
          />
        </BarChart>
      </ChartContainer>
    </Panel>
  )
}