
// Mock DUPR Service
// In a production environment, this would call a Firebase Cloud Function 
// which then proxies the request to the official DUPR API.

export interface DuprRatings {
    singles: number;
    doubles: number;
}

export const fetchDuprRatings = async (duprId: string): Promise<DuprRatings> => {
    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!duprId) {
        // Allow testing without an ID for now
        console.warn("No DUPR ID provided to service, using mock defaults");
    }

    // Specific values requested by user
    return {
        singles: 3.402,
        doubles: 4.018
    };
};
