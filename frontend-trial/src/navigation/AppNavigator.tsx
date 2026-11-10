import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DroneDetailScreen from '../screens/DroneDetailScreen';
import DroneListScreen from '../screens/DroneListScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={DroneListScreen} />
        <Stack.Screen name="Dron" component={DroneDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
