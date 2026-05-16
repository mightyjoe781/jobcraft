export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  tailoring_preference: "conservative" | "balanced" | "aggressive";
  plan: string;
  is_admin: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}
