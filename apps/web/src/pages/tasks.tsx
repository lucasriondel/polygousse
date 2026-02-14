import { useState } from "react";
import { RunTaskDialog } from "@/components/run-task-dialog";
import { TaskList } from "@/components/task-list";
import type { Task } from "@/hooks/use-tasks";
import { useAllTasks } from "@/hooks/use-tasks";
import type { Workspace } from "@/hooks/use-workspaces";
import { useStore } from "@/store";

export function TasksPage() {
	const { workspacesWithTasks } = useAllTasks();
	const updateTask = useStore((s) => s.updateTask);
	const deleteTask = useStore((s) => s.deleteTask);
	const createTask = useStore((s) => s.createTask);
	const reorderTasks = useStore((s) => s.reorderTasks);
	const startTask = useStore((s) => s.startTask);
	const [runDialogTaskId, setRunDialogTaskId] = useState<number | null>(null);
	const runDialogTask = useStore((s) => (runDialogTaskId !== null ? s.tasks.get(runDialogTaskId) ?? null : null));
	const [runDialogWorkspace, setRunDialogWorkspace] = useState<Workspace | null>(null);

	const handleUpdate = async (
		id: number,
		fields: Partial<Pick<Task, "title" | "description" | "status">>,
	) => {
		await updateTask(id, fields);
	};

	const handleDelete = async (id: number) => {
		await deleteTask(id);
	};

	const handleCreate = async (workspaceId: number, title: string) => {
		await createTask(workspaceId, title);
	};

	const handleReorder = async (workspaceId: number, taskIds: number[]) => {
		await reorderTasks(workspaceId, taskIds);
	};

	const handleStart = (taskId: number, ws: Workspace) => {
		setRunDialogTaskId(taskId);
		setRunDialogWorkspace(ws);
	};

	const handleRun = async (
		taskId: number,
		options: {
			permissionMode?: string;
			planMode?: boolean;
			worktreePath?: string;
			ralphMode?: boolean;
			maxIterations?: number;
		},
	) => {
		await startTask(taskId, {
			permissionMode: options.permissionMode,
			planMode: options.planMode,
			cwd: options.worktreePath,
			ralphMode: options.ralphMode,
			maxIterations: options.maxIterations,
		});
	};

	return (
		<div className="mx-auto max-w-2xl px-4 py-16">
			<h1 className="text-4xl font-bold tracking-tight mb-8">All Tasks</h1>

			<div className="space-y-8">
				{workspacesWithTasks.map((ws) => {
					const activeTasks = ws.tasks.filter((t) => t.status !== "done");
					return (
						<section key={ws.id}>
							<h2 className="text-lg font-semibold mb-2">{ws.name}</h2>
							<TaskList
								tasks={activeTasks}
								onUpdate={handleUpdate}
								onDelete={handleDelete}
								onCreate={(title) => handleCreate(ws.id, title)}
								onStart={(taskId) => handleStart(taskId, ws)}
								onReorder={(taskIds) => handleReorder(ws.id, taskIds)}
							/>
						</section>
					);
				})}
			</div>
			<RunTaskDialog
				open={runDialogTask !== null}
				onOpenChange={(open) => {
					if (!open) {
						setRunDialogTaskId(null);
						setRunDialogWorkspace(null);
					}
				}}
				task={runDialogTask}
				workspace={runDialogWorkspace}
				onRun={handleRun}
			/>
		</div>
	);
}
