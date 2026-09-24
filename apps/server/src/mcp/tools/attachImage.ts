import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { db } from '../../db/client.js';
import { linkedInClient } from '../../linkedin/index.js';
import { getAuthorWithAccessToken } from '../../services/authorService.js';
import { attachImage, getPost } from '../../services/postService.js';
import { requireUserId, type ToolExtra } from '../context.js';

export function registerAttachImageTool(server: McpServer): void {
  server.registerTool(
    'attach_image',
    {
      title: 'Attach an image to a LinkedIn draft',
      description:
        'Downloads an image from a URL, uploads it to LinkedIn, and attaches it to a draft post.',
      inputSchema: {
        draftId: z.string().uuid(),
        imageUrl: z.string().url(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args, extra: ToolExtra) => {
      const userId = requireUserId(extra);
      const post = await getPost(db, args.draftId);
      if (!post || post.createdBy !== userId) {
        throw new Error('Draft not found');
      }

      const author = await getAuthorWithAccessToken(db, post.authorId);
      if (!author) {
        throw new Error('Author has no connected LinkedIn account');
      }

      const imageRes = await fetch(args.imageUrl);
      if (!imageRes.ok) {
        throw new Error(`Could not fetch image: ${imageRes.status}`);
      }
      const contentType = imageRes.headers.get('content-type') ?? 'image/jpeg';
      const bytes = new Uint8Array(await imageRes.arrayBuffer());

      const { uploadUrl, imageUrn } = await linkedInClient.initializeImageUpload(
        author.accessToken,
        author.urn,
      );
      await linkedInClient.uploadImageBytes(uploadUrl, bytes, contentType);

      const draft = await attachImage(db, args.draftId, { imageUrn });
      return {
        content: [{ type: 'text', text: `Image attached to draft ${draft?.id}.` }],
      };
    },
  );
}
