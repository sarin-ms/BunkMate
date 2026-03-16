const imgTagRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
const htmlTagRegex = /<[^>]+>/g;

export type ContentNode =
  | { type: "text"; text: string }
  | { type: "image"; imgUrl: string };

export const parseHtmlContent = (html: string): ContentNode[] => {
  const content: ContentNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Helper function to clean and push text
  const processAndPushText = (rawText: string) => {
    const textContent = rawText
      .replace(htmlTagRegex, " ") // Replace tags with spaces, not empty strings
      .replace(/\s+/g, " ") // Normalize multiple spaces into one
      .trim();

    if (textContent) {
      content.push({ type: "text", text: textContent.trim() });
    }
  };

  while ((match = imgTagRegex.exec(html)) !== null) {
    const imgUrl = match[1];
    const imgStartIndex = match.index;
    const imgEndIndex = imgTagRegex.lastIndex;

    // 1. Add text content before the image tag
    if (imgStartIndex > lastIndex) {
      processAndPushText(html.substring(lastIndex, imgStartIndex));
    }

    // 2. Add the image content
    content.push({ type: "image", imgUrl });

    // 3. Update the index
    lastIndex = imgEndIndex;
  }

  // BUG FIX: Catch any remaining text after the final image
  if (lastIndex < html.length) {
    processAndPushText(html.substring(lastIndex));
  }

  return content;
};
