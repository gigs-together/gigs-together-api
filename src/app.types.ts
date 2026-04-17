export interface AppRootResponse {
  readonly ok: true;
  readonly service: 'gigs-together-api';
}

export interface AppHealthResponse {
  readonly ok: true;
  readonly service: 'gigs-together-api';
  readonly checks: {
    readonly mongodb: {
      readonly ok: true;
    };
  };
}
