import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { useMcpUiInit, waitForRenderData } from '#app/utils/mcp.client.ts'
import { type Route } from './+types/journal-viewer.tsx'

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
	const renderData = await waitForRenderData(
		z.object({
			entries: z.array(
				z.object({
					id: z.number(),
					title: z.string(),
					tagCount: z.number(),
				}),
			),
		}),
		{ signal: request.signal, timeoutMs: 3_000 },
	)
	return { entries: renderData.entries }
}

export function HydrateFallback() {
	return (
		<div className="flex min-h-48 flex-col items-center justify-center py-12">
			<svg
				className="text-muted-foreground mb-4 h-8 w-8 animate-spin"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				aria-label="Loading"
			>
				<circle
					className="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					strokeWidth="4"
				/>
				<path
					className="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
				/>
			</svg>
			<p className="text-muted-foreground text-lg">
				Waiting for journal entries...
			</p>
		</div>
	)
}

export default function JournalViewer({ loaderData }: Route.ComponentProps) {
	const { entries } = loaderData

	useMcpUiInit()

	return (
		<div className="bg-background min-h-screen p-4">
			<div className="mx-auto max-w-4xl">
				<div className="bg-card mb-6 rounded-xl border p-6 shadow-lg">
					<h1 className="text-foreground mb-2 text-3xl font-bold">
						Your Journal
					</h1>
					<p className="text-muted-foreground">
						You have {entries.length} journal{' '}
						{entries.length === 1 ? 'entry' : 'entries'}
					</p>
				</div>

				{entries.length === 0 ? (
					<div className="bg-card rounded-xl border p-8 text-center shadow-lg">
						<div
							className="mb-4 text-6xl"
							role="img"
							aria-label="Empty journal"
						>
							📝
						</div>
						<h2 className="text-foreground mb-2 text-xl font-semibold">
							No Journal Entries Yet
						</h2>
						<p className="text-muted-foreground">
							Start writing your thoughts and experiences to see them here.
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{entries.map((entry) => (
							<div
								key={entry.id}
								className="bg-card rounded-xl border p-6 shadow-sm transition-all hover:shadow-md"
							>
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="mb-3 flex items-center gap-3">
											<h3 className="text-foreground text-lg font-semibold">
												{entry.title}
											</h3>
										</div>

										<div className="mb-3 flex flex-wrap gap-2">
											<span className="bg-accent text-accent-foreground rounded-full px-3 py-1 text-sm">
												🏷️ {entry.tagCount} tag{entry.tagCount !== 1 ? 's' : ''}
											</span>
										</div>

										<div className="mt-4">
											<button className="text-primary text-sm font-medium hover:underline">
												View Details
											</button>
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
