/** @jsxRuntime classic */
import React, { useEffect, useRef, useState } from "react"

import { Button, Notice } from "@/components/ui-react"

type JobStatus =
	| "queued"
	| "running"
	| "finalizing"
	| "succeeded"
	| "partial"
	| "failed"
	| "cancelled"

export type PricingBulkJobView = {
	job: {
		id: string
		operationType: "create_pricing_rule" | "preview_pricing_rule"
		status: JobStatus
		totalItems: number
		pendingItems: number
		runningItems: number
		completedItems: number
		succeededItems: number
		failedItems: number
		skippedItems: number
		cancelledItems: number
		finalErrorDetail?: string | null
		finalizationErrorDetail?: string | null
	}
	items: Array<{
		id: string
		ratePlanId: string
		productNameSnapshot?: string | null
		variantNameSnapshot?: string | null
		status: "queued" | "running" | "succeeded" | "failed" | "skipped" | "cancelled"
		errorCode?: string | null
		errorDetail?: string | null
	}>
}

type Props = {
	jobId: string
	onTerminal?: (job: PricingBulkJobView) => void
}

const terminalStatuses = new Set<JobStatus>(["succeeded", "partial", "failed", "cancelled"])

function operationLabel(operationType: PricingBulkJobView["job"]["operationType"]) {
	return operationType === "preview_pricing_rule" ? "Vista previa preparada" : "Operación preparada"
}

function statusLabel(status: JobStatus) {
	return {
		queued: "En cola",
		running: "Aplicando",
		finalizing: "Actualizando ventas",
		succeeded: "Completada",
		partial: "Completada con incidencias",
		failed: "No completada",
		cancelled: "Cancelada",
	}[status]
}

function itemLabel(item: PricingBulkJobView["items"][number]) {
	const product = String(item.productNameSnapshot ?? "").trim()
	const variant = String(item.variantNameSnapshot ?? "").trim()
	return [product, variant].filter(Boolean).join(" · ") || `Tarifa ${item.ratePlanId}`
}

export default function PricingBulkJobOperationPanel({ jobId, onTerminal }: Props) {
	const [result, setResult] = useState<PricingBulkJobView | null>(null)
	const [error, setError] = useState("")
	const [retrying, setRetrying] = useState(false)
	const [pollCycle, setPollCycle] = useState(0)
	const notifiedTerminalRef = useRef<string | null>(null)
	const onTerminalRef = useRef(onTerminal)

	useEffect(() => {
		onTerminalRef.current = onTerminal
	}, [onTerminal])

	useEffect(() => {
		let cancelled = false
		let timeout: number | null = null
		async function refresh() {
			try {
				const response = await fetch(`/api/pricing/bulk-jobs/${encodeURIComponent(jobId)}`, {
					headers: { Accept: "application/json" },
				})
				const body = (await response.json().catch(() => ({}))) as PricingBulkJobView
				if (!response.ok)
					throw new Error((body as any)?.error || "No se pudo consultar la operación.")
				if (cancelled) return
				setResult(body)
				setError("")
				if (terminalStatuses.has(body.job.status)) {
					if (notifiedTerminalRef.current !== `${body.job.id}:${body.job.status}`) {
						notifiedTerminalRef.current = `${body.job.id}:${body.job.status}`
						onTerminalRef.current?.(body)
					}
					return
				}
				timeout = window.setTimeout(refresh, 2_000)
			} catch (cause) {
				if (cancelled) return
				setError(cause instanceof Error ? cause.message : "No se pudo consultar la operación.")
				timeout = window.setTimeout(refresh, 4_000)
			}
		}
		void refresh()
		return () => {
			cancelled = true
			if (timeout != null) window.clearTimeout(timeout)
		}
	}, [jobId, pollCycle])

	async function retryFailed() {
		setRetrying(true)
		try {
			const response = await fetch(`/api/pricing/bulk-jobs/${encodeURIComponent(jobId)}/retry`, {
				method: "POST",
				headers: { Accept: "application/json" },
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok)
				throw new Error(body?.error || "No se pudieron reintentar las tarifas fallidas.")
			notifiedTerminalRef.current = null
			setResult((current) =>
				current ? { ...current, job: { ...current.job, ...body.job } } : current
			)
			setPollCycle((current) => current + 1)
			setError("")
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "No se pudieron reintentar las tarifas fallidas."
			)
		} finally {
			setRetrying(false)
		}
	}

	if (!result) {
		return (
			<Notice title="Operación preparada">
				La operación entró a la cola. Preparando su progreso...
			</Notice>
		)
	}

	const { job } = result
	const total = Math.max(1, job.totalItems)
	const itemStatusCounts = result.items.reduce(
		(counts, item) => {
			counts[item.status] = (counts[item.status] ?? 0) + 1
			return counts
		},
		{} as Record<string, number>
	)
	const liveSucceeded = itemStatusCounts.succeeded ?? job.succeededItems
	const liveFailed = itemStatusCounts.failed ?? job.failedItems
	const liveOmitted =
		(itemStatusCounts.skipped ?? job.skippedItems) +
		(itemStatusCounts.cancelled ?? job.cancelledItems)
	const liveCompleted = liveSucceeded + liveFailed + liveOmitted
	const progress = Math.min(100, Math.round((liveCompleted / total) * 100))
	const failedItems = result.items.filter((item) => item.status === "failed")
	const isTerminal = terminalStatuses.has(job.status)
	const hasFailures = liveFailed > 0
	const noticeVariant = job.status === "failed" ? "error" : hasFailures ? "warning" : "info"

	return (
		<div className="space-y-4" aria-live="polite">
			<Notice variant={noticeVariant} title={operationLabel(job.operationType)}>
				<div className="space-y-3">
					<p>
						{job.totalItems} {job.totalItems === 1 ? "tarifa" : "tarifas"} ·{" "}
						{statusLabel(job.status)}
					</p>
					<div>
						<div className="mb-1 flex items-center justify-between gap-3 text-xs font-medium">
							<span>Progreso real</span>
							<span>{progress}%</span>
						</div>
						<div
							className="h-2 overflow-hidden rounded-full bg-slate-200"
							role="progressbar"
							aria-valuenow={progress}
							aria-valuemin={0}
							aria-valuemax={100}
						>
							<div
								className="h-full rounded-full bg-slate-900 transition-[width] duration-300"
								style={{ width: `${progress}%` }}
							/>
						</div>
					</div>
					<div className="grid grid-cols-3 gap-2 text-xs">
						<span>
							<strong className="block text-sm text-slate-950">{liveSucceeded}</strong>aplicadas
						</span>
						<span>
							<strong className="block text-sm text-slate-950">{liveOmitted}</strong>omitidas
						</span>
						<span>
							<strong className="block text-sm text-slate-950">{liveFailed}</strong>fallidas
						</span>
					</div>
				</div>
			</Notice>

			{error && (
				<Notice variant="error" title="No pudimos actualizar el estado">
					{error}
				</Notice>
			)}
			{(job.finalizationErrorDetail || job.finalErrorDetail) && (
				<p className="text-xs text-slate-600">
					{job.finalizationErrorDetail || job.finalErrorDetail}
				</p>
			)}
			{failedItems.length > 0 && (
				<div className="space-y-2 border-t border-slate-200 pt-3">
					<p className="text-sm font-semibold text-slate-900">Tarifas que requieren atención</p>
					<div className="space-y-2">
						{failedItems.map((item) => (
							<Notice key={item.id} variant="error" className="text-xs">
								<p className="font-semibold">{itemLabel(item)}</p>
								<p>{item.errorDetail || item.errorCode || "No se pudo aplicar esta tarifa."}</p>
							</Notice>
						))}
					</div>
				</div>
			)}
			{isTerminal && (
				<div className="flex flex-wrap items-center gap-2">
					{hasFailures && (
						<Button
							type="button"
							variant="secondary"
							onClick={() => void retryFailed()}
							disabled={retrying}
						>
							{retrying ? "Reintentando..." : "Reintentar fallidas"}
						</Button>
					)}
					<a
						href={`/rates/pricing-jobs/${encodeURIComponent(job.id)}`}
						className="text-sm font-semibold text-slate-700 underline-offset-4 hover:underline"
					>
						Ver actividad de la operación
					</a>
				</div>
			)}
		</div>
	)
}
