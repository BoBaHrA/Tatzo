import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BookingConfig } from '@/api/types';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function isoDate(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function addDays(value: string, count: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + count);
  return isoDate(date);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function shiftMonth(value: string, amount: number) {
  const date = parseDate(`${value}-01`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return isoDate(date).slice(0, 7);
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function zonedDateAndMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value ?? ''
  );
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

export function availableBookingTimes(
  config: BookingConfig,
  date: string,
  duration: number,
) {
  if (!date || config.vacations.includes(date)) return [];
  const weekday = String(parseDate(date).getUTCDay());
  const schedule = config.schedule[weekday];
  if (!schedule?.open || !schedule.close) return [];

  const open = timeMinutes(schedule.open);
  const close = timeMinutes(schedule.close);
  const bookedMinutes = config.booked_minutes_by_date[date] ?? 0;
  if (bookedMinutes + duration > config.settings.maximum_session_hours * 60) {
    return [];
  }
  const blocked = config.occupied_slots.filter((slot) => slot.date === date);
  const noticeThreshold = zonedDateAndMinutes(
    new Date(Date.now() + config.settings.minimum_notice_hours * 60 * 60 * 1000),
    config.artist_timezone,
  );
  const result: string[] = [];
  for (
    let start = open;
    start + duration <= close;
    start += config.settings.slot_step_minutes
  ) {
    const end = start + duration;
    const insideNotice = date < noticeThreshold.date
      || (date === noticeThreshold.date && start < noticeThreshold.minutes);
    const overlapsBreak = schedule.breaks.some(([breakStart, breakEnd]) => (
      start < timeMinutes(breakEnd) && end > timeMinutes(breakStart)
    ));
    const overlapsBlocked = blocked.some((slot) => (
      start < timeMinutes(slot.end_time) && end > timeMinutes(slot.start_time)
    ));
    if (!insideNotice && !overlapsBreak && !overlapsBlocked) {
      result.push(minutesTime(start));
    }
  }
  return result;
}

function isOpenDate(config: BookingConfig, value: string) {
  if (value < config.today || config.vacations.includes(value)) return false;
  const lastDate = addDays(config.today, config.settings.maximum_booking_window_days);
  if (value > lastDate) return false;
  const schedule = config.schedule[String(parseDate(value).getUTCDay())];
  return Boolean(schedule?.open && schedule.close);
}

type BookingCalendarProps = {
  config: BookingConfig;
  selectedDate: string;
  onSelect: (date: string) => void;
};

export function BookingCalendar({
  config,
  selectedDate,
  onSelect,
}: BookingCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(monthKey(selectedDate || config.today));
  useEffect(() => {
    if (selectedDate) setVisibleMonth(monthKey(selectedDate));
  }, [selectedDate]);

  const maxMonth = monthKey(
    addDays(config.today, config.settings.maximum_booking_window_days),
  );
  const cells = useMemo(() => {
    const first = parseDate(`${visibleMonth}-01`);
    const offset = first.getUTCDay();
    const daysInMonth = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12),
    ).getUTCDate();
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => (
        `${visibleMonth}-${String(index + 1).padStart(2, '0')}`
      )),
    ];
  }, [visibleMonth]);
  const weekdayLabels = useMemo(() => Array.from({ length: 7 }, (_, index) => (
    new Intl.DateTimeFormat(appLanguage, { weekday: 'narrow', timeZone: 'UTC' })
      .format(new Date(Date.UTC(2024, 0, 7 + index)))
  )), []);

  return (
    <View style={styles.calendar}>
      <View style={styles.monthHeader}>
        <Pressable
          accessibilityLabel={t('previousMonth')}
          disabled={visibleMonth <= monthKey(config.today)}
          onPress={() => setVisibleMonth((current) => shiftMonth(current, -1))}
          style={({ pressed }) => [
            styles.monthButton,
            visibleMonth <= monthKey(config.today) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.monthButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>
          {new Intl.DateTimeFormat(appLanguage, {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(parseDate(`${visibleMonth}-01`))}
        </Text>
        <Pressable
          accessibilityLabel={t('nextMonth')}
          disabled={visibleMonth >= maxMonth}
          onPress={() => setVisibleMonth((current) => shiftMonth(current, 1))}
          style={({ pressed }) => [
            styles.monthButton,
            visibleMonth >= maxMonth && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.monthButtonText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {weekdayLabels.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.weekday}>{label}</Text>
        ))}
      </View>
      <View style={styles.days}>
        {cells.map((value, index) => value ? (
          <Pressable
            accessibilityRole="button"
            disabled={!isOpenDate(config, value)}
            key={value}
            onPress={() => onSelect(value)}
            style={({ pressed }) => [
              styles.day,
              value === selectedDate && styles.daySelected,
              !isOpenDate(config, value) && styles.dayDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[
              styles.dayText,
              value === selectedDate && styles.dayTextSelected,
            ]}>
              {Number(value.slice(-2))}
            </Text>
          </Pressable>
        ) : <View key={`empty-${index}`} style={styles.day} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: {
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  monthButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  monthButtonText: { color: colors.primary, fontSize: 30, lineHeight: 32 },
  monthTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  weekRow: { flexDirection: 'row' },
  weekday: {
    width: '14.285%',
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  days: { flexDirection: 'row', flexWrap: 'wrap' },
  day: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.small,
  },
  daySelected: { backgroundColor: colors.primary },
  dayDisabled: { opacity: 0.25 },
  dayText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  dayTextSelected: { color: colors.backgroundDeep },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.65 },
});
