import { invariantResponse } from '@epic-web/invariant'
import { getTokenInfo } from '#app/utils/auth.ts'
import { useMcpUiInit } from '#app/utils/mcp.ts'
import { type Route } from './+types/journal-viewer.tsx'

export async function loader({ request, context }: Route.LoaderArgs) {
	// const tokenInfo = await getTokenInfo(request, context.cloudflare.env)
	// invariantResponse(tokenInfo, 'Unauthorized', { status: 401 })
	// const entries = await context.db.getEntries(Number(tokenInfo.userId))
	//
	const user = await context.db.getUserByEmail('me+goose@kentcdodds.com')
	invariantResponse(user, 'User not found', { status: 404 })
	const entries = await context.db.getEntries(user.id)
	return { entries }
}

export default function JournalViewer({ loaderData }: Route.ComponentProps) {
	const { entries } = loaderData

	useMcpUiInit()

	return (
		<div className="bg-background min-h-screen p-4">
			<div className="mx-auto max-w-4xl">
				<div className="bg-card mb-6 rounded-xl p-6 shadow-lg">
					<h1 className="text-foreground mb-2 text-3xl font-bold">
						Your Journal
					</h1>
					<p className="text-muted-foreground">
						You have {entries.length} journal{' '}
						{entries.length === 1 ? 'entry' : 'entries'}
					</p>
				</div>

				{entries.length === 0 ? (
					<div className="bg-card rounded-xl p-8 text-center shadow-lg">
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
								className="bg-card border-border rounded-xl border p-6 shadow-sm transition-all hover:shadow-md"
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
