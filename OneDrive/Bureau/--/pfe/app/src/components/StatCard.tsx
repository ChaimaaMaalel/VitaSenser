import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
};

export function StatCard({ title, value, subtitle, icon }: StatCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.value}>{value}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
  value: {
    marginTop: 6,
    fontSize: 24,
    color: colors.text,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textMuted,
  },
  iconWrap: {
    marginLeft: 10,
  },
});
