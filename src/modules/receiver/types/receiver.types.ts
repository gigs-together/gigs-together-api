export interface CreateGigJobPayload {
  readonly gig: {
    readonly title: string;
    readonly date: string;
    readonly city: string;
    readonly country: string;
    readonly venue: string;
    readonly ticketsUrl: string;
    readonly poster?: {
      readonly bucketPath?: string;
      readonly externalUrl?: string;
    };
  };
  readonly requestedBy?: {
    readonly isAdmin?: boolean;
  };
  readonly meta?: {
    readonly enqueuedAt?: number;
  };
}
