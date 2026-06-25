import { Text, View } from 'react-native';

/** Tiny component used to prove the RN component render test pipeline works. */
export function Hello({ name }: { name: string }) {
  return (
    <View>
      <Text>Hello, {name}!</Text>
    </View>
  );
}
