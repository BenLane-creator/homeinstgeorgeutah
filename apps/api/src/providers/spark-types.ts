export type SparkEnv = {
  SPARK_API_BASE_URL?: string;
  SPARK_ACCESS_TOKEN?: string;
  MLS_PROVIDER_NAME?: string;
};

export type SparkRawListing = Record<string, unknown>;

export type SparkCollectionResponse = {
  value?: SparkRawListing[];
  D?: {
    Results?: SparkRawListing[];
    Success?: boolean;
  };
  Results?: SparkRawListing[];
  [key: string]: unknown;
};
