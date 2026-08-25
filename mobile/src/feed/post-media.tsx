import { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import type { FeedMedia } from '@/api/types';
import { colors, radius, spacing } from '@/theme';


function FeedVideo({ url, width, height }: { url: string; width: number; height: number }) {
  const player = useVideoPlayer({ uri: url, useCaching: true });

  return (
    <VideoView
      accessibilityLabel="Tattoo video"
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      nativeControls
      player={player}
      style={{ width, height }}
    />
  );
}

type PostMediaProps = {
  media: FeedMedia[];
};

export function PostMedia({ media }: PostMediaProps) {
  const items = media.filter((item) => Boolean(item.url));
  const [frameWidth, setFrameWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  // Keep feed media close to the mobile web treatment: compact enough that
  // author/content/actions remain visible, while still leaving room for tattoo detail.
  const frameHeight = Math.min(Math.max(frameWidth * 0.82, 210), 310);

  if (items.length === 0) return null;

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!frameWidth) return;
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / frameWidth);
    setActiveIndex(Math.max(0, Math.min(nextIndex, items.length - 1)));
  };

  return (
    <View
      onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}
      style={[styles.frame, { height: frameHeight }]}
    >
      {frameWidth ? (
        <ScrollView
          horizontal
          bounces={items.length > 1}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          pagingEnabled
          scrollEnabled={items.length > 1}
          showsHorizontalScrollIndicator={false}
        >
          {items.map((item) => (
            <View key={item.id} style={{ width: frameWidth, height: frameHeight }}>
              {item.type === 'video' ? (
                <FeedVideo url={item.url} width={frameWidth} height={frameHeight} />
              ) : (
                <Image
                  accessibilityLabel="Tattoo image"
                  resizeMode={items.length === 1 ? 'contain' : 'cover'}
                  source={{ uri: item.url }}
                  style={{ width: frameWidth, height: frameHeight }}
                />
              )}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {items.length > 1 ? (
        <View style={styles.counter}>
          <Text style={styles.counterText}>{activeIndex + 1} / {items.length}</Text>
        </View>
      ) : null}

      {items.length > 1 ? (
        <View pointerEvents="none" style={styles.dots}>
          {items.map((item, index) => (
            <View
              key={item.id}
              style={[styles.dot, index === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    minHeight: 210,
    overflow: 'hidden',
    backgroundColor: colors.black,
    borderRadius: 14,
  },
  counter: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 8, 14, 0.78)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  counterText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  dots: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
  },
  dotActive: {
    width: 14,
    backgroundColor: colors.primary,
  },
});
