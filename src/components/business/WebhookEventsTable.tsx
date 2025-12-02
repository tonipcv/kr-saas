"use client"
import React from 'react'

type Row = {
  id: string
  provider: string
  hook_id: string | null
  provider_event_id: string | null
  type: string
  status: string | null
  processed: boolean
  retry_count: number | null
  max_retries: number | null
  next_retry_at: string | null
  received_at: string
  processed_at: string | null
  processing_error: string | null
  error_type: string | null
  moved_dead_letter: boolean | null
  dead_letter_reason: string | null
  obj_id?: any
  raw: any
}

export default function WebhookEventsTable({ rows }: { rows: Row[] }) {
  const [open, setOpen] = React.useState(false)
  const [current, setCurrent] = React.useState<Row | null>(null)
  const onRowDoubleClick = (r: Row) => { setCurrent(r); setOpen(true) }

  const close = () => { setOpen(false); setCurrent(null) }

  const providerLabel = (p?: string) => (p === 'pagarme' ? 'KRX Pay' : String(p || '').toUpperCase())

  return (
    <>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/80 text-xs text-gray-600">
            <tr>
              <th className="px-2 py-2 text-left">Received</th>
              <th className="px-2 py-2 text-left">Provider</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">Processed</th>
              <th className="px-2 py-2 text-left">Attempts</th>
              <th className="px-2 py-2 text-left">Next Retry</th>
              <th className="px-2 py-2 text-left">Err</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 align-top cursor-zoom-in" onDoubleClick={() => onRowDoubleClick(r)} title="Double-click to view details">
                <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{fmtDate(r.received_at)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{providerLabel(r.provider)}</td>
                <td className="px-2 py-2 min-w-[220px]">
                  <div className="font-medium text-gray-900">{r.type}</div>
                  <div className="text-xs text-gray-500">{r.provider_event_id}</div>
                  {r.obj_id ? (<div className="text-xs text-gray-500">obj: {String(r.obj_id)}</div>) : null}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{r.processed ? 'yes' : 'no'}</td>
                <td className="px-2 py-2 whitespace-nowrap">{Number(r.retry_count || 0)} / {Number(r.max_retries || 3)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{r.next_retry_at ? fmtDate(r.next_retry_at) : '—'}</td>
                <td className="px-2 py-2 max-w-[220px] truncate" title={r.processing_error || ''}>{r.processing_error || '—'}</td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRowDoubleClick(r)}
                    className="inline-flex items-center rounded-lg p-1.5 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    title="Edit"
                    aria-label="Edit"
                  >
                    {/* Pencil icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M21.731 2.269a2.625 2.625 0 0 0-3.714 0l-1.157 1.157 3.714 3.714 1.157-1.157a2.625 2.625 0 0 0 0-3.714z" />
                      <path d="M3 17.25V21h3.75l10.94-10.94-3.714-3.714L3 17.25z" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-6 text-gray-500" colSpan={8}>No webhook events.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={close}>
          <div className="bg-white rounded-2xl border border-gray-200 max-w-3xl w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="text-[15px] font-semibold text-gray-900">Event details</div>
                <div className="text-xs text-gray-500">{providerLabel(current.provider)} • {current.type}</div>
              </div>
              <button onClick={close} className="px-2 py-1 rounded-md border border-gray-200 text-sm bg-white hover:bg-gray-50">Close</button>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Provider" value={providerLabel(current.provider)} />
              <Field label="Type" value={current.type} />
              <Field label="Hook ID" value={current.hook_id || '—'} />
              <Field label="Event ID" value={current.provider_event_id || '—'} />
              <Field label="Processed" value={current.processed ? 'yes' : 'no'} />
              <Field label="Status" value={current.status || '—'} />
              <Field label="Attempts" value={`${Number(current.retry_count || 0)} / ${Number(current.max_retries || 3)}`} />
              <Field label="Next Retry" value={current.next_retry_at ? fmtDate(current.next_retry_at) : '—'} />
              <Field label="Received" value={fmtDate(current.received_at)} />
              <Field label="Processed At" value={current.processed_at ? fmtDate(current.processed_at) : '—'} />
              <Field label="Error" value={current.processing_error || '—'} />
              <Field label="Error Type" value={current.error_type || '—'} />
              <Field label="Dead Letter" value={current.moved_dead_letter ? `yes (${current.dead_letter_reason || ''})` : 'no'} />
            </div>
            <div className="px-4 pb-4">
              <div className="text-xs text-gray-600 mb-1">Payload</div>
              <pre className="p-2 bg-gray-50 rounded-lg max-h-[360px] overflow-auto text-xs">{JSON.stringify(current.raw, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function fmtDate(v: any) {
  try { const d = new Date(v); return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d) } catch { return String(v ?? '') }
}

function Field({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 break-words">{value}</div>
    </div>
  )
}
