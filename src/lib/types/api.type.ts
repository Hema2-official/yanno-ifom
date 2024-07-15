type LoginResponse = {
	account_id: number;
};

type MeResponse = {
	id: number;
	email: string;
	created_at: string;
	updated_at: string;
};

enum ProjectStatus {
	pending = 'pending',
	uploading = 'uploading',
	processing = 'processing',
	ready = 'ready',
	editing = 'editing',
	failed = 'failed'
}

type Project = {
	id: number;
	name: string;
	status: ProjectStatus;
	source_data: string;
	editor_data: string;
	created_at: string;
	updated_at: string;
	versions: {
		original: string;
		edited: string[];
	};
};

type APIError = {
	detail: string;
};

type CredentialsError = {
	detail: {
		email_field_message?: string;
		password_field_message?: string;
	};
};

export type { LoginResponse, MeResponse, APIError, CredentialsError, Project };
export { ProjectStatus };
