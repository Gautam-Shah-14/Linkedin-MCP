// LinkedIn's post `commentary` field uses a "Little Text" format where these
// characters are reserved and must be backslash-escaped, or they can break
// or truncate the post: ( ) [ ] { } < > @ | ~ _ * \
const RESERVED_CHARS = /[()[\]{}<>@|~_*\\]/g;

export function escapeLittleText(input: string): string {
  return input.replace(RESERVED_CHARS, (char) => `\\${char}`);
}
