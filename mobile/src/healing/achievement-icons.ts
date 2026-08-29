import type { ImageSourcePropType } from 'react-native';

import type { HealingAchievements } from '@/api/types';

export const HEALING_ACHIEVEMENT_ICONS: Record<keyof HealingAchievements, ImageSourcePropType> = {
  first_checkin: require('../../assets/web-icons/calendar.png'),
  seven_day_streak: require('../../assets/web-icons/healing.png'),
  three_checkins: require('../../assets/dashboard-icons/statistics.png'),
  fully_healed: require('../../assets/web-icons/health-safety.png'),
};
