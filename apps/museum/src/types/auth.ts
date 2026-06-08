export interface CurrentUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  role: "user" | "admin" | "superadmin";
  group: { id: string; name: string; description: string } | null;
  canUpload: boolean;
}
