import { getSetting } from "@polygousse/database";
import type { LinearIssue, LinearIssueDetail, LinearProject, LinearTeam } from "@polygousse/types";

const LINEAR_API_URL = "https://api.linear.app/graphql";

async function linearQuery<T>(
	query: string,
	variables?: Record<string, unknown>,
	extraHeaders?: Record<string, string>,
): Promise<T> {
	const setting = getSetting.get("linear_api_token");
	if (!setting) {
		throw new Error("Linear API token not configured");
	}

	const response = await fetch(LINEAR_API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: setting.value,
			...extraHeaders,
		},
		body: JSON.stringify({ query, variables }),
	});

	const json = (await response.json()) as { data?: T; errors?: { message: string }[] };

	if (!response.ok) {
		const errMsg = json.errors?.length
			? json.errors.map((e) => e.message).join("; ")
			: `${response.status} ${response.statusText}`;
		throw new Error(`Linear API error: ${errMsg}`);
	}

	if (json.errors?.length) {
		throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
	}

	return json.data as T;
}

export async function getLinearTeams(): Promise<LinearTeam[]> {
	const data = await linearQuery<{ teams: { nodes: LinearTeam[] } }>(
		`query { teams { nodes { id name key } } }`,
	);
	return data.teams.nodes;
}

export async function getLinearTeamIssues(
	teamId: string,
	projectIds?: string[],
): Promise<LinearIssue[]> {
	const hasProjectFilter = projectIds && projectIds.length > 0;

	const filter = hasProjectFilter
		? `filter: { state: { type: { nin: ["canceled"] } }, project: { id: { in: $projectIds } } }`
		: `filter: { state: { type: { nin: ["canceled"] } } }`;

	const varDefs = hasProjectFilter
		? "$teamId: String!, $first: Int, $projectIds: [ID!]!"
		: "$teamId: String!, $first: Int";

	interface RawIssue {
		id: string;
		identifier: string;
		title: string;
		url: string;
		state: { id: string; name: string; type: string };
		attachments: { nodes: { id: string }[] };
	}
	const data = await linearQuery<{
		team: { issues: { nodes: RawIssue[] } };
	}>(
		`query(${varDefs}) {
			team(id: $teamId) {
				issues(
					first: $first
					${filter}
					orderBy: updatedAt
				) {
					nodes { id identifier title url state { id name type } attachments { nodes { id } } }
				}
			}
		}`,
		{ teamId, first: 50, ...(hasProjectFilter ? { projectIds } : {}) },
	);
	return data.team.issues.nodes.map((n) => ({
		id: n.id,
		identifier: n.identifier,
		title: n.title,
		url: n.url,
		state: n.state,
		attachmentCount: n.attachments.nodes.length,
	}));
}

export async function getLinearTeamProjects(teamId: string): Promise<LinearProject[]> {
	const data = await linearQuery<{
		team: { projects: { nodes: LinearProject[] } };
	}>(
		`query($teamId: String!) {
			team(id: $teamId) {
				projects(first: 50, orderBy: updatedAt) {
					nodes { id name state }
				}
			}
		}`,
		{ teamId },
	);
	return data.team.projects.nodes;
}

async function getIssueTeamId(issueId: string): Promise<string> {
	const data = await linearQuery<{ issue: { team: { id: string } } }>(
		`query($issueId: String!) {
			issue(id: $issueId) { team { id } }
		}`,
		{ issueId },
	);
	return data.issue.team.id;
}

async function findWorkflowState(
	teamId: string,
	stateType: string,
): Promise<{ id: string; name: string; type: string }> {
	const data = await linearQuery<{
		workflowStates: { nodes: { id: string; name: string; type: string }[] };
	}>(
		`query($teamId: ID, $stateType: String!) {
			workflowStates(filter: { team: { id: { eq: $teamId } }, type: { eq: $stateType } }) {
				nodes { id name type }
			}
		}`,
		{ teamId, stateType },
	);
	const state = data.workflowStates.nodes[0];
	if (!state) {
		throw new Error(`No ${stateType} state found for team`);
	}
	return state;
}

async function updateIssueState(issueId: string, stateId: string): Promise<void> {
	await linearQuery(
		`mutation($issueId: String!, $stateId: String!) {
			issueUpdate(id: $issueId, input: { stateId: $stateId }) {
				success
			}
		}`,
		{ issueId, stateId },
	);
}

export async function markLinearIssueInProgress(issueId: string): Promise<void> {
	const teamId = await getIssueTeamId(issueId);
	const startedState = await findWorkflowState(teamId, "started");
	await updateIssueState(issueId, startedState.id);
}

export async function markLinearIssueDone(issueId: string): Promise<void> {
	const teamId = await getIssueTeamId(issueId);
	const completedState = await findWorkflowState(teamId, "completed");
	await updateIssueState(issueId, completedState.id);
}

export async function getLinearIssueDetail(issueId: string): Promise<LinearIssueDetail> {
	const data = await linearQuery<{
		issue: {
			description: string | null;
			attachments: {
				nodes: { id: string; title: string | null; url: string; sourceType: string | null }[];
			};
		};
	}>(
		`query($issueId: String!) {
			issue(id: $issueId) {
				description
				attachments { nodes { id title url sourceType } }
			}
		}`,
		{ issueId },
		{ "public-file-urls-expire-in": "300" },
	);
	return {
		description: data.issue.description,
		attachments: data.issue.attachments.nodes,
	};
}

export function getLinearApiToken(): string | null {
	const setting = getSetting.get("linear_api_token");
	return setting?.value ?? null;
}

export function isLinearConfigured(): boolean {
	return getSetting.get("linear_api_token") != null;
}
