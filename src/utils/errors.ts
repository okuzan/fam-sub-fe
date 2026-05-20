type ServerErrorResponse = {
    message?: unknown;
    error?: unknown;
};

const getText = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export const getResponseErrorMessage = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => null) as ServerErrorResponse | null;
    return getText(data?.message) ?? getText(data?.error) ?? fallback;
};
