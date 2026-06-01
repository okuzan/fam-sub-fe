export interface AccountResponse {
    id: string;
    email: string;
    roles: string[];
    createdAt: string | null;
    updatedAt: string | null;
    canDelete: boolean;
}
