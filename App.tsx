import { LegendList } from '@legendapp/list/react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Side-by-side comparison of sticky section headers on WEB:
//   LEFT   — AnimatedLegendList (@legendapp/list/reanimated) with
//            stickyHeaderIndices. Its sticky pinning is a per-frame
//            translateY computed from the scroll offset in a useAnimatedStyle
//            (ReanimatedPositionViewSticky). On native that worklet runs on
//            the UI thread (exact); on web there is no UI thread, so the
//            transform is applied by the JS thread a frame (or more) late —
//            the pinned header visibly rides down with the content and gets
//            pulled back up, every frame. THIS is the main bug.
//   MIDDLE — plain LegendList with stickyHeaderIndices. Web pins the ACTIVE
//            header via CSS position:sticky — solid at normal scroll speeds,
//            but the header SWAP is instant (no animated push-off transition
//            like the control column's), and because the active-index switch
//            is JS-driven, heavy JS load can produce a stale pinned banner or
//            briefly stacked banners.
//   RIGHT  — plain RN ScrollView with stickyHeaderIndices (react-native-web
//            renders them as in-flow CSS position:sticky). Control column:
//            compositor-driven, pixel-stable at any scroll speed.
//
// Repro: run `npx expo start --web`, scroll each column with a fast
// mouse-wheel / trackpad fling. The LEFT column's jiggle is visible at 1x CPU;
// throttle the CPU 4x/6x in DevTools Performance to exaggerate everything.

type Row = { type: 'header' | 'item'; section: number; label: string };

const SECTION_COUNT = 12;
const ITEMS_PER_SECTION = 15;
const HEADER_HEIGHT = 48;
const ITEM_HEIGHT = 44;

const buildRows = (): Row[] => {
  const rows: Row[] = [];
  for (let s = 1; s <= SECTION_COUNT; s++) {
    rows.push({ type: 'header', section: s, label: `Section ${s}` });
    for (let i = 1; i <= ITEMS_PER_SECTION; i++) {
      rows.push({ type: 'item', section: s, label: `Item ${s}.${i}` });
    }
  }
  return rows;
};

const SectionHeader = ({ label }: { label: string }) => (
  <View style={styles.header}>
    <Text style={styles.headerText}>{label}</Text>
  </View>
);

const ItemRow = ({ label }: { label: string }) => (
  <View style={styles.item}>
    <Text style={styles.itemText}>{label}</Text>
  </View>
);

const renderRow = (row: Row) =>
  row.type === 'header' ? <SectionHeader label={row.label} /> : <ItemRow label={row.label} />;

export default function App() {
  const rows = useMemo(buildRows, []);
  const stickyIndices = useMemo(
    () => rows.map((row, index) => (row.type === 'header' ? index : -1)).filter((i) => i >= 0),
    [rows],
  );

  const listProps = {
    style: styles.list,
    data: rows,
    keyExtractor: (row: Row) => `${row.type}-${row.section}-${row.label}`,
    getItemType: (row: Row) => row.type,
    getFixedItemSize: (row: Row) => (row.type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT),
    estimatedItemSize: ITEM_HEIGHT,
    stickyHeaderIndices: stickyIndices,
    renderItem: ({ item }: { item: Row }) => renderRow(item),
  } as const;

  return (
    <View style={styles.root}>
      <View style={styles.column}>
        <Text style={styles.columnTitle}>AnimatedLegendList — header rides the scroll</Text>
        <AnimatedLegendList {...listProps} />
      </View>

      <View style={styles.separator} />

      <View style={styles.column}>
        <Text style={styles.columnTitle}>LegendList — pins fine, but no push-off transition</Text>
        <LegendList {...listProps} />
      </View>

      <View style={styles.separator} />

      <View style={styles.column}>
        <Text style={styles.columnTitle}>RN ScrollView — CSS sticky, stable</Text>
        <ScrollView style={styles.list} stickyHeaderIndices={stickyIndices}>
          {rows.map((row) => (
            <React.Fragment key={`${row.type}-${row.section}-${row.label}`}>
              {renderRow(row)}
            </React.Fragment>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#111' },
  column: { flex: 1 },
  separator: { width: 2, backgroundColor: '#444' },
  columnTitle: {
    color: '#fff',
    fontWeight: 'bold',
    padding: 12,
    textAlign: 'center',
    backgroundColor: '#222',
  },
  list: { flex: 1 },
  header: {
    height: HEADER_HEIGHT,
    backgroundColor: '#0a84ff',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  headerText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    backgroundColor: '#1a1a1a',
  },
  itemText: { color: '#ccc' },
});
