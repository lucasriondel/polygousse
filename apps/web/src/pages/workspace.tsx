import { FolderPlus } from "lucide-react";
import { Tabs } from "radix-ui";
import { FolderSection } from "@/components/folder-section";
import { LinearTasksPanel } from "@/components/linear-tasks-panel";
import { RunTaskDialog } from "@/components/run-task-dialog";
import { TaskList } from "@/components/task-list";
import type { TaskStatus } from "@/hooks/use-tasks";
import { useWorkspaceTaskManagement } from "@/hooks/use-workspace-task-management";
import type { Workspace } from "@/hooks/use-workspaces";
import { useStore } from "@/store";

const statusGroups: { status: TaskStatus; label: string }[] = [
	{ status: "waiting_for_input", label: "Waiting for Input" },
	{ status: "doing", label: "In Progress" },
	{ status: "todo", label: "To Do" },
	{ status: "done", label: "Done" },
];

interface WorkspacePageProps {
	workspace: Workspace;
	showDone?: boolean;
}

export function WorkspacePage({
	workspace,
	showDone = true,
}: WorkspacePageProps) {
	const mgmt = useWorkspaceTaskManagement(workspace);

	const linearTaskLinks = useStore((s) => s.linearTaskLinks);
	const todoTasks = mgmt.tasks.filter(
		(t) => t.status === "todo" && !linearTaskLinks.has(t.id),
	);
	const ungroupedTodo = todoTasks.filter((t) => t.folder_id === null);
	const nonTodoGroups = statusGroups
		.filter((g) => g.status !== "todo")
		.map((g) => {
			const filtered = mgmt.tasks.filter((t) => t.status === g.status);
			if (g.status === "done") {
				filtered.sort((a, b) => {
					const aTime = a.completed_at ?? a.created_at;
					const bTime = b.completed_at ?? b.created_at;
					return bTime.localeCompare(aTime);
				});
			}
			return { ...g, tasks: filtered };
		})
		.filter((g) => g.tasks.length > 0);

	const hasLinearTeam = workspace.linear_team_id !== null;

	const tasksContent = (
		<>
			<div className="space-y-6">
				{nonTodoGroups
					.filter((g) => g.status === "waiting_for_input" || g.status === "doing")
					.map((g) => (
						<section key={g.status}>
							<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
								{g.label}
							</h2>
							<TaskList
								tasks={g.tasks}
								onUpdate={mgmt.handleUpdate}
								onDelete={mgmt.handleDelete}
								onStart={mgmt.handleStart}
								onReorder={mgmt.reorder}
							/>
						</section>
					))}

				<section>
					<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
						To Do
					</h2>
					<TaskList
						tasks={ungroupedTodo}
						onUpdate={mgmt.handleUpdate}
						onDelete={mgmt.handleDelete}
						onCreate={mgmt.handleCreate}
						onStart={mgmt.handleStart}
						onReorder={mgmt.reorder}
						folderId={null}
						onTaskDrop={mgmt.handleTaskDrop}
					/>
					{mgmt.folders.length > 0 && (
						<div
							role="list"
							className="mt-2 space-y-1"
							onDragOver={mgmt.handleFolderDragOver}
							onDrop={mgmt.handleFolderDrop}
							onDragLeave={mgmt.clearFolderDropIndex}
						>
							{mgmt.folders.map((folder, index) => (
								<div key={folder.id} ref={(el) => mgmt.setFolderRef(folder.id, el)}>
									{mgmt.folderDropIndex === index && mgmt.draggingFolderId !== null && (
										<div className="h-0.5 bg-amber-500 rounded-full mx-2 my-px" />
									)}
									<FolderSection
										folder={folder}
										tasks={todoTasks.filter((t) => t.folder_id === folder.id)}
										onUpdate={mgmt.handleUpdate}
										onDelete={mgmt.handleDelete}
										onCreate={mgmt.handleCreateInFolder}
										onStart={mgmt.handleStart}
										onReorder={mgmt.reorder}
										onRename={mgmt.renameFolder}
										onDeleteFolder={mgmt.removeFolder}
										onTaskDrop={mgmt.handleTaskDrop}
										isDragging={mgmt.draggingFolderId === folder.id}
										onDragStart={() => mgmt.handleFolderDragStart(folder.id)}
										onDragEnd={mgmt.handleFolderDragEnd}
									/>
								</div>
							))}
							{mgmt.folderDropIndex === mgmt.folders.length && mgmt.draggingFolderId !== null && (
								<div className="h-0.5 bg-amber-500 rounded-full mx-2 my-px" />
							)}
						</div>
					)}
					<button
						type="button"
						className="flex items-center gap-2 py-1.5 px-2 mt-1 text-sm text-muted-foreground hover:text-amber-500 rounded-md hover:bg-amber-500/10 w-full"
						onClick={mgmt.handleAddFolder}
					>
						<FolderPlus className="h-4 w-4" />
						Add folder
					</button>
				</section>

				{showDone &&
					nonTodoGroups
						.filter((g) => g.status === "done")
						.map((g) => (
							<section key={g.status}>
								<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
									{g.label}
								</h2>
								<TaskList
									tasks={g.tasks}
									onUpdate={mgmt.handleUpdate}
									onDelete={mgmt.handleDelete}
									onCreate={mgmt.handleCreate}
									onReorder={mgmt.reorder}
								/>
							</section>
						))}
			</div>
			<RunTaskDialog
				open={mgmt.runDialogTask !== null}
				onOpenChange={(open) => {
					if (!open) mgmt.setRunDialogTaskId(null);
				}}
				task={mgmt.runDialogTask}
				workspace={workspace}
				onRun={mgmt.handleRun}
			/>
		</>
	);

	return (
		<div className="mx-auto max-w-2xl px-4 py-8">
			{hasLinearTeam ? (
				<Tabs.Root defaultValue="polygousse">
					<Tabs.List className="flex gap-4 border-b mb-6">
						<Tabs.Trigger
							value="polygousse"
							className="pb-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-amber-500 -mb-px"
						>
							Polygousse Tasks
						</Tabs.Trigger>
						<Tabs.Trigger
							value="linear"
							className="pb-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-amber-500 -mb-px"
						>
							Linear Tasks
						</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="polygousse">{tasksContent}</Tabs.Content>
					<Tabs.Content value="linear">
						<LinearTasksPanel workspace={workspace} />
					</Tabs.Content>
				</Tabs.Root>
			) : (
				tasksContent
			)}
		</div>
	);
}
