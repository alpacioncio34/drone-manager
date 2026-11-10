import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../navigation/types';

type ArrowProps = {
  label: string;
  onPress: () => void;
};

function Arrow({ label, onPress }: ArrowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
    >
      <Text style={styles.arrowText}>{label}</Text>
    </Pressable>
  );
}

export default function DroneDetailScreen({ route }: RootStackScreenProps<'Dron'>) {
  const { id } = route.params;

  const handleForward = () => {};
  const handleBack = () => {};
  const handleLeft = () => {};
  const handleRight = () => {};
  const handleDown = () => {};
  const handleUp = () => {};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dron {id}</Text>

      <View style={styles.controls}>
        <View style={styles.pad}>
          <Arrow label="▲" onPress={handleForward} />
          <View style={styles.row}>
            <Arrow label="◀" onPress={handleLeft} />
            <View style={styles.spacer} />
            <Arrow label="▶" onPress={handleRight} />
          </View>
          <Arrow label="▼" onPress={handleBack} />
        </View>

        <View style={styles.pad}>
          <Arrow label="▲" onPress={handleUp} />
          <Arrow label="▼" onPress={handleDown} />
        </View>
      </View>
    </View>
  );
}

const SIZE = 88;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 28, color: '#fff' },
  pad: { alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  spacer: { width: SIZE },
  arrow: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#20252b',
    borderRadius: 24,
  },
  arrowPressed: { backgroundColor: '#2e353d' },
  arrowText: { color: '#fff', fontSize: 28 },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
  },
});