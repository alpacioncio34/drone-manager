import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';

/** Screens of the root stack and the params each one receives. */
export type RootStackParamList = {
  Home: undefined;
  Dron: { id: string };
};

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>;

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
