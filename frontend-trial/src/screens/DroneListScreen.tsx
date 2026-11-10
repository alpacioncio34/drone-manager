import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getEntradas, type Entrada } from '../lib/api';
import type { RootStackNavigation } from '../navigation/types';

export default function DroneListScreen() {
  const navigation = useNavigation<RootStackNavigation>();
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEntradas()
      .then(setEntradas)
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator />}

      {entradas.map((e) => (
        <Pressable
          key={e.id}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('Dron', { id: e.id })}
        >
          <Text style={styles.cardText}>{e.nombre}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 32, paddingHorizontal: 24, gap: 14 },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#20252b',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  cardPressed: { backgroundColor: '#2e353d' },
  cardText: { color: '#fff', fontSize: 18, fontWeight: '500' },
});