export type IgPostSlide = {
  id: string;
  type: "image" | "video";
  displayUrl: string;
  videoUrl?: string;
  width?: number;
  height?: number;
};

export type IgPost = {
  id: string;
  shortCode?: string;
  url?: string;
  type: "image" | "video" | "sidecar";
  caption: string;
  displayUrl: string;
  videoUrl?: string;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string;
  slides: IgPostSlide[];
};

export type IgProfile = {
  username: string;
  fullName: string;
  biography: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  profilePicUrl?: string;
  verified: boolean;
  private: boolean;
  externalUrl?: string;
  posts: IgPost[];
};

export type IgStoryItem = {
  id: string;
  mediaType: "image" | "video";
  imageUrl?: string;
  videoUrl?: string;
  takenAt?: number;
  expiringAt?: number;
  width?: number;
  height?: number;
  caption?: string;
};

export type IgHighlight = {
  id: string;
  title: string;
  coverImageUrl?: string;
  mediaCount?: number;
  items: IgStoryItem[];
};

export type IgStories = {
  username: string;
  isPrivate: boolean;
  isAccessible: boolean;
  errorMessage?: string | null;
  stories: IgStoryItem[];
  highlights: IgHighlight[];
};
