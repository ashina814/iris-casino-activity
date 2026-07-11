interface UserAvatarProps {
  displayName: string;
  avatarUrl: string | null;
}

export function UserAvatar({ displayName, avatarUrl }: UserAvatarProps) {
  if (avatarUrl) {
    return <img className="avatar" src={avatarUrl} alt={`${displayName} avatar`} />;
  }

  return (
    <div className="avatar avatar--fallback" aria-label={`${displayName} avatar`}>
      {displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}
