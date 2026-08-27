import type { ComponentProps } from 'react';

import { PostMediaLayoutProvider } from './post-media';
import { WebPostCard } from './web-post-card';


type PostCardProps = ComponentProps<typeof WebPostCard>;

export function PostCard(props: PostCardProps) {
  return (
    <PostMediaLayoutProvider layout={props.post.layout}>
      <WebPostCard {...props} />
    </PostMediaLayoutProvider>
  );
}
