// Declarations for optional integrations that are not installed in the Node
// build. Keep these surfaces limited to the APIs used by the application.

declare module "google-auth-library" {
  export interface GoogleAuthOptions {
    scopes?: string[]
    projectId?: string
  }

  export interface AuthClient {
    getAccessToken(): Promise<{ token?: string | null } | null>
    getRequestHeaders(): Record<string, string>
  }

  export class GoogleAuth {
    constructor(options?: GoogleAuthOptions)
    getClient(): Promise<AuthClient>
  }
}

declare module "@azure/identity" {
  export interface AccessToken {
    token: string
    expiresOnTimestamp: number
  }

  export class DefaultAzureCredential {
    getToken(scopes: string | string[]): Promise<AccessToken | null>
  }

  export function getBearerTokenProvider(
    credential: DefaultAzureCredential,
    scopes: string | string[],
  ): () => Promise<string>
}

declare module "@anthropic-ai/bedrock-sdk" {
  import type { ClientOptions } from "@anthropic-ai/sdk"

  export interface AnthropicBedrockOptions extends ClientOptions {
    awsRegion?: string
    skipAuth?: boolean
    awsAccessKey?: string
    awsSecretKey?: string
    awsSessionToken?: string
  }

  export class AnthropicBedrock {
    constructor(options?: AnthropicBedrockOptions)
  }
}

declare module "@anthropic-ai/foundry-sdk" {
  import type { ClientOptions } from "@anthropic-ai/sdk"

  export interface AnthropicFoundryOptions extends ClientOptions {
    azureADTokenProvider?: () => Promise<string>
  }

  export class AnthropicFoundry {
    constructor(options?: AnthropicFoundryOptions)
  }
}

declare module "@anthropic-ai/vertex-sdk" {
  import type { ClientOptions } from "@anthropic-ai/sdk"
  import type { GoogleAuth } from "google-auth-library"

  export interface AnthropicVertexOptions extends ClientOptions {
    region?: string
    googleAuth?: GoogleAuth
  }

  export class AnthropicVertex {
    constructor(options?: AnthropicVertexOptions)
  }
}

declare module "@smithy/node-http-handler" {
  import type { Agent as HttpAgent } from "node:http"
  import type { Agent as HttpsAgent } from "node:https"

  export class NodeHttpHandler {
    constructor(options?: { httpAgent?: HttpAgent; httpsAgent?: HttpsAgent })
  }
}

declare module "@smithy/core" {
  export class NoAuthSigner {}
}

declare module "@aws-sdk/client-bedrock" {
  export interface AwsCredentials {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }

  export interface AwsAuthScheme {
    schemeId: string
    identityProvider: () => () => Promise<Record<string, unknown>>
    signer: unknown
  }

  export interface BedrockClientConfig {
    region?: string
    endpoint?: string
    requestHandler?: unknown
    credentials?: AwsCredentials | (() => Promise<AwsCredentials>)
    httpAuthSchemes?: AwsAuthScheme[]
    httpAuthSchemeProvider?: () => Array<{ schemeId: string }>
  }

  export interface InferenceProfileSummary {
    inferenceProfileId?: string
  }

  export interface ListInferenceProfilesCommandInput {
    nextToken?: string
    typeEquals?: string
  }

  export class ListInferenceProfilesCommand {
    readonly input: ListInferenceProfilesCommandInput
    constructor(input: ListInferenceProfilesCommandInput)
  }

  export interface GetInferenceProfileCommandInput {
    inferenceProfileIdentifier: string
  }

  export class GetInferenceProfileCommand {
    readonly input: GetInferenceProfileCommandInput
    constructor(input: GetInferenceProfileCommandInput)
  }

  export class BedrockClient {
    constructor(config?: BedrockClientConfig)
    send(
      command: ListInferenceProfilesCommand,
    ): Promise<{
      inferenceProfileSummaries?: InferenceProfileSummary[]
      nextToken?: string
    }>
    send(command: GetInferenceProfileCommand): Promise<{
      models?: Array<{ modelArn?: string }>
    }>
  }
}

declare module "@aws-sdk/client-bedrock-runtime" {
  import type { BedrockClientConfig } from "@aws-sdk/client-bedrock"

  export interface CountTokensCommandInput {
    modelId: string
    input: {
      invokeModel: {
        body: Uint8Array
      }
    }
  }

  export class CountTokensCommand {
    readonly input: CountTokensCommandInput
    constructor(input: CountTokensCommandInput)
  }

  export class BedrockRuntimeClient {
    constructor(config?: BedrockClientConfig)
    send(command: CountTokensCommand): Promise<{ inputTokens?: number }>
  }
}

declare module "@aws-sdk/client-sts" {
  import type { BedrockClientConfig } from "@aws-sdk/client-bedrock"

  export class GetCallerIdentityCommand {
    constructor(input: Record<string, never>)
  }

  export class STSClient {
    constructor(config?: BedrockClientConfig)
    send(command: GetCallerIdentityCommand): Promise<Record<string, unknown>>
  }
}

declare module "@aws-sdk/credential-providers" {
  import type { AwsCredentials } from "@aws-sdk/client-bedrock"

  export function fromIni(options?: {
    ignoreCache?: boolean
  }): () => Promise<AwsCredentials>
}

declare module "@aws-sdk/credential-provider-node" {
  import type { AwsCredentials } from "@aws-sdk/client-bedrock"

  export function defaultProvider(options?: {
    clientConfig?: { requestHandler?: unknown }
  }): () => Promise<AwsCredentials>
}

// Sharp is an optional native dependency. The application already narrows its
// dynamic import to a local structural Sharp subset, while one fallback relies
// on CommonJS/ESM callable interop that cannot be represented by a typed module
// namespace under bundler resolution.
declare module "sharp"
