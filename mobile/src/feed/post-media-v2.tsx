import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from '@/components/text';
import { useVideoPlayer, VideoView } from 'expo-video';

import type { FeedMedia, FeedPost } from '@/api/types';
import { colors, radius, spacing } from '@/theme';


type FeedLayout = FeedPost['layout'];

type PostMediaLayoutProviderProps = {
  children: ReactNode;
  layout: FeedLayout;
};

const PostMediaLayoutContext = createContext<FeedLayout>('grid');
const GAP = 8;
const THUMB_GAP = 16;
const THUMB_PADDING = 16;

export function PostMediaLayoutProvider({
  children,
  layout,
}: PostMediaLayoutProviderProps) {
  return (
    <PostMediaLayoutContext.Provider value={layout}>
      {children}
    </PostMediaLayoutContext.Provider>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function FeedVideo({
  url,
  controls = true,
  fit = 'cover',
}: {
  url: string;
  controls?: boolean;
  fit?: 'contain' | 'cover';
}) {
  const player = useVideoPlayer({ uri: url, useCaching: true });

  return (
    <VideoView
      accessibilityLabel="Tattoo video"
      contentFit={fit}
      fullscreenOptions={{ enable: controls }}
      nativeControls={controls}
      player={player}
      style={StyleSheet.absoluteFill}
      surfaceType={controls ? 'surfaceView' : 'textureView'}
    />
  );
}

function VideoThumbnail({ url }: { url: string }) {
  return (
    <View pointerEvents="none" style={styles.videoThumb}>
      <FeedVideo controls={false} fit="cover" url={url} />
      <View pointerEvents="none" style={styles.videoThumbOverlay}>
        <View style={styles.videoThumbPlayBadge}>
          <Text style={styles.videoThumbText}>▶</Text>
        </View>
      </View>
    </View>
  );
}

function MediaCell({
  item,
  style,
  contain = false,
  controls = true,
}: {
  item: FeedMedia;
  style: StyleProp<ViewStyle>;
  contain?: boolean;
  controls?: boolean;
}) {
  const fit = contain ? 'contain' : 'cover';

  return (
    <View style={[styles.mediaCell, style]}>
      {item.type === 'image' && contain ? (
        <>
          <Image
            accessibilityIgnoresInvertColors
            blurRadius={26}
            resizeMode="cover"
            source={{ uri: item.url }}
            style={[StyleSheet.absoluteFill, styles.blurBackdrop]}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdropShade]} />
        </>
      ) : null}

      {item.type === 'video' ? (
        <FeedVideo controls={controls} fit={fit} url={item.url} />
      ) : (
        <Image
          accessibilityLabel="Tattoo image"
          resizeMode={fit}
          source={{ uri: item.url }}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

function SingleMedia({ item, width }: { item: FeedMedia; width: number }) {
  const height = clamp(width * 0.82, 220, 340);
  return <MediaCell contain item={item} style={{ width, height }} />;
}

function GridMedia({ items }: { items: FeedMedia[] }) {
  const [width, setWidth] = useState(0);

  const setMeasuredWidth = (next: number) => {
    if (Math.abs(next - width) > 1) setWidth(next);
  };

  const row = (
    rowItems: FeedMedia[],
    columns: number,
    height: number,
    key: string,
  ) => {
    const cellWidth = (width - GAP * (columns - 1)) / columns;
    return (
      <View key={key} style={styles.mediaRow}>
        {rowItems.map((item) => (
          <MediaCell
            item={item}
            key={item.id}
            style={{ width: cellWidth, height }}
          />
        ))}
      </View>
    );
  };

  const renderMeasured = () => {
    const total = items.length;
    if (!width || !total) return null;

    if (total === 1) return <SingleMedia item={items[0]} width={width} />;

    const twoHeight = clamp(width * 0.50, 150, 205);
    const threeHeight = clamp(width * 0.34, 105, 145);

    if (total === 2) return row(items, 2, twoHeight, 'l2');

    if (total === 3) {
      const height = clamp(width * 0.72, 230, 310);
      const leftWidth = ((width - GAP) * 2) / 3;
      const rightWidth = width - GAP - leftWidth;
      const smallHeight = (height - GAP) / 2;
      return (
        <View style={styles.mediaRow}>
          <MediaCell item={items[0]} style={{ width: leftWidth, height }} />
          <View style={[styles.mediaColumn, { width: rightWidth, height }]}>
            <MediaCell item={items[1]} style={{ width: rightWidth, height: smallHeight }} />
            <MediaCell item={items[2]} style={{ width: rightWidth, height: smallHeight }} />
          </View>
        </View>
      );
    }

    if (total === 4) {
      return (
        <>
          {row(items.slice(0, 2), 2, twoHeight, 'l4-top')}
          {row(items.slice(2, 4), 2, twoHeight, 'l4-bottom')}
        </>
      );
    }

    if (total === 5) {
      return (
        <>
          {row(items.slice(0, 2), 2, twoHeight, 'l5-top')}
          {row(items.slice(2, 5), 3, threeHeight, 'l5-bottom')}
        </>
      );
    }

    if (total === 6) {
      return (
        <>
          {row(items.slice(0, 3), 3, threeHeight, 'l6-top')}
          {row(items.slice(3, 6), 3, threeHeight, 'l6-bottom')}
        </>
      );
    }

    if (total === 7 || total >= 10) {
      const stripItems = items.slice(2);
      const exactWidth = (width - GAP * Math.max(0, stripItems.length - 1)) / Math.max(1, stripItems.length);
      const stripWidth = Math.max(40, exactWidth);
      return (
        <>
          {row(items.slice(0, 2), 2, twoHeight, 'strip-top')}
          <View style={[styles.stripRow, { height: stripWidth }]}>
            {stripItems.map((item) => (
              <MediaCell
                controls={false}
                item={item}
                key={item.id}
                style={{ width: stripWidth, height: stripWidth }}
              />
            ))}
          </View>
        </>
      );
    }

    if (total === 8) {
      return (
        <>
          {row(items.slice(0, 2), 2, twoHeight, 'l8-top')}
          {row(items.slice(2, 5), 3, threeHeight, 'l8-middle')}
          {row(items.slice(5, 8), 3, threeHeight, 'l8-bottom')}
        </>
      );
    }

    if (total === 9) {
      return (
        <>
          {row(items.slice(0, 3), 3, threeHeight, 'l9-top')}
          {row(items.slice(3, 6), 3, threeHeight, 'l9-middle')}
          {row(items.slice(6, 9), 3, threeHeight, 'l9-bottom')}
        </>
      );
    }

    return null;
  };

  return (
    <View
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
      style={styles.grid}
    >
      {width ? renderMeasured() : <View style={styles.measurePlaceholder} />}
    </View>
  );
}

function CarouselThumbnail({
  active,
  item,
  index,
  baseSize,
  activeScale,
  onPress,
}: {
  active: boolean;
  item: FeedMedia;
  index: number;
  baseSize: number;
  activeScale: number;
  onPress: () => void;
}) {
  const activation = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(activation, {
      toValue: active ? 1 : 0,
      speed: 22,
      bounciness: 5,
      useNativeDriver: true,
    }).start();
  }, [activation, active]);

  // Keep the spring inside the space reserved for the enlarged thumbnail.
  const scale = activation.interpolate({ inputRange: [0, 1], outputRange: [1, activeScale], extrapolate: 'clamp' });
  const opacity = activation.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  return (
    <Animated.View style={{ width: baseSize, height: baseSize, opacity, transform: [{ scale }] }}>
      <Pressable
        accessibilityLabel={`Media ${index + 1}`}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.thumb,
          active && styles.thumbActive,
          pressed && styles.thumbPressed,
        ]}
      >
        {item.type === 'image' ? (
          <Image resizeMode="cover" source={{ uri: item.url }} style={StyleSheet.absoluteFill} />
        ) : (
          <VideoThumbnail url={item.url} />
        )}
      </Pressable>
    </Animated.View>
  );
}

function CarouselMedia({ items }: { items: FeedMedia[] }) {
  const scrollRef = useRef<ScrollView>(null);
  const thumbsRef = useRef<ScrollView>(null);
  const activeIndexRef = useRef(0);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const transition = useRef(new Animated.Value(1)).current;
  const height = clamp(width * 0.76, 230, 335);
  const largeThumbSet = items.length >= 6;
  const baseSize = largeThumbSet ? 82 : 90;
  const activeScale = largeThumbSet ? 1.28 : 1.22;
  const thumbRailHeight = largeThumbSet ? 130 : 122;
  const thumbsContentWidth = THUMB_PADDING * 2 + items.length * baseSize + (items.length - 1) * THUMB_GAP;

  const scrollToActiveThumbnail = useCallback(() => {
    if (!width) return;
    const center = THUMB_PADDING + activeIndex * (baseSize + THUMB_GAP) + baseSize / 2;
    const x = clamp(center - width / 2, 0, Math.max(0, thumbsContentWidth - width));
    thumbsRef.current?.scrollTo({ x, animated: true });
  }, [activeIndex, baseSize, thumbsContentWidth, width]);

  useEffect(scrollToActiveThumbnail, [scrollToActiveThumbnail]);

  // Preserve the selected page when the post resizes or its media count changes.
  useEffect(() => {
    if (!width) return;
    const bounded = clamp(activeIndexRef.current, 0, items.length - 1);
    activeIndexRef.current = bounded;
    setActiveIndex(bounded);
    scrollRef.current?.scrollTo({ x: bounded * width, animated: false });
  }, [items.length, width]);

  const setMeasuredWidth = (next: number) => {
    if (Math.abs(next - width) > 1) setWidth(next);
  };

  const animateSelection = () => {
    transition.stopAnimation();
    transition.setValue(0);
    Animated.timing(transition, {
      toValue: 1,
      duration: 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const select = (index: number) => {
    const bounded = Math.max(0, Math.min(index, items.length - 1));
    if (bounded === activeIndexRef.current) return;
    activeIndexRef.current = bounded;
    setActiveIndex(bounded);
    animateSelection();
    if (width) scrollRef.current?.scrollTo({ x: bounded * width, animated: true });
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const nextIndex = Math.max(
      0,
      Math.min(Math.round(event.nativeEvent.contentOffset.x / width), items.length - 1),
    );
    if (nextIndex !== activeIndexRef.current) {
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      animateSelection();
    }
  };

  const mainScale = transition.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] });
  const mainOpacity = transition.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <View
      onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
      style={styles.carousel}
    >
      {width ? (
        <>
          <Animated.View style={[styles.carouselMain, { height, opacity: mainOpacity, transform: [{ scale: mainScale }] }]}>
            <ScrollView
              bounces={items.length > 1}
              decelerationRate="fast"
              horizontal
              onMomentumScrollEnd={handleScrollEnd}
              pagingEnabled
              ref={scrollRef}
              scrollEnabled={items.length > 1}
              showsHorizontalScrollIndicator={false}
              style={{ width, height }}
            >
              {items.map((item) => (
                <MediaCell
                  contain
                  item={item}
                  key={item.id}
                  style={{ width, height }}
                />
              ))}
            </ScrollView>

            {items.length > 1 ? (
              <View pointerEvents="none" style={styles.counter}>
                <Text style={styles.counterText}>{activeIndex + 1} / {items.length}</Text>
              </View>
            ) : null}
          </Animated.View>

          {items.length > 1 ? (
            <View
              collapsable={false}
              style={[styles.thumbsViewport, { height: thumbRailHeight }]}
            >
              <ScrollView
                bounces={false}
                horizontal
                nestedScrollEnabled
                onContentSizeChange={scrollToActiveThumbnail}
                overScrollMode="never"
                ref={thumbsRef}
                showsHorizontalScrollIndicator={false}
                style={{ width, height: thumbRailHeight }}
                contentContainerStyle={[
                  styles.thumbsRow,
                  thumbsContentWidth <= width && styles.thumbsRowCentered,
                  { minHeight: thumbRailHeight },
                ]}
              >
                {items.map((item, index) => (
                  <CarouselThumbnail
                    active={index === activeIndex}
                    activeScale={activeScale}
                    baseSize={baseSize}
                    index={index}
                    item={item}
                    key={item.id}
                    onPress={() => select(index)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.measurePlaceholder} />
      )}
    </View>
  );
}

type PostMediaProps = {
  media: FeedMedia[];
};

export function PostMedia({ media }: PostMediaProps) {
  const layout = useContext(PostMediaLayoutContext);
  const items = media
    .filter((item) => Boolean(item.url))
    .sort((left, right) => left.order - right.order);

  if (!items.length) return null;

  return layout === 'carousel'
    ? <CarouselMedia items={items} />
    : <GridMedia items={items} />;
}

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    gap: GAP,
    overflow: 'hidden',
    borderRadius: 16,
  },
  mediaRow: {
    width: '100%',
    flexDirection: 'row',
    gap: GAP,
  },
  mediaColumn: {
    gap: GAP,
  },
  stripRow: {
    width: '100%',
    flexDirection: 'row',
    gap: GAP,
    overflow: 'hidden',
  },
  mediaCell: {
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#001b1a',
    borderRadius: 12,
  },
  blurBackdrop: {
    opacity: 0.72,
    transform: [{ scale: 1.16 }],
  },
  backdropShade: {
    backgroundColor: 'rgba(0,0,0,.26)',
  },
  measurePlaceholder: {
    width: '100%',
    height: 230,
    borderRadius: 14,
    backgroundColor: '#001b1a',
  },
  carousel: {
    width: '100%',
    minWidth: 0,
    gap: 10,
    overflow: 'hidden',
  },
  carouselMain: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#001b1a',
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
  thumbsViewport: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 14,
  },
  thumbsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THUMB_GAP,
    paddingHorizontal: THUMB_PADDING,
  },
  thumbsRowCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.09)',
    backgroundColor: '#002b2a',
  },
  thumbActive: {
    borderColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  thumbPressed: {
    opacity: 0.74,
  },
  videoThumb: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#001b1a',
  },
  videoThumbOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,.12)',
  },
  videoThumbPlayBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.22)',
  },
  videoThumbText: {
    color: colors.white,
    fontSize: 11,
    marginLeft: 1,
  },
});
