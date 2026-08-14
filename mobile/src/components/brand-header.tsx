import { Image, StyleSheet, View } from 'react-native';


export function BrandHeader() {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/tatzo5.png')}
        resizeMode="contain"
        style={styles.logo}
        accessibilityLabel="Tatzo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
  },
  logo: {
    width: 150,
    height: 46,
  },
});
