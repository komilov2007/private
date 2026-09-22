export const PAGE_SIZE = 30;
export const CHAT_BUCKET = "chat-media";
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 30 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export const EMOJIS = ["❤️", "😂", "🥰", "😍", "😘", "😊", "😭", "👍", "🤍", "✨", "🌙", "🔥", "😄", "🙈", "💌", "💐"];

export const STICKERS = [
  { id: "heart", label: "Heart", src: "/stickers/heart.svg" },
  { id: "sun", label: "Sun", src: "/stickers/sun.svg" },
  { id: "moon", label: "Moon", src: "/stickers/moon.svg" },
  { id: "flower", label: "Flower", src: "/stickers/flower.svg" },
] as const;
