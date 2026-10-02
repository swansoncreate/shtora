import type { IgHighlight, IgProfile, IgStories } from "../types";

export type EngineTokens = {
  hiker: string;
  apify: string;
  tikhub: string;
};

export type InstagramSource = {
  readonly name: string;
  canRun(tokens: EngineTokens): boolean;
  profile?(username: string, tokens: EngineTokens, force: boolean): Promise<IgProfile>;
  stories?(username: string, tokens: EngineTokens, force: boolean): Promise<IgStories>;
  highlight?(id: string, tokens: EngineTokens): Promise<IgHighlight>;
};
