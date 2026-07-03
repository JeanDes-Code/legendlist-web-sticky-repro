import { LegendList } from '@legendapp/list/react-native';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Side-by-side comparison of sticky headers on WEB:
//   LEFT  — @legendapp/list with stickyHeaderIndices (JS-driven pinning)
//   RIGHT — plain RN ScrollView with stickyHeaderIndices (react-native-web
//           renders these as CSS `position: sticky` — compositor-driven)
//
// Repro: run `npx expo start --web`, then scroll BOTH columns with a fast
// mouse-wheel / trackpad fling.
//   RIGHT: the section header stays pinned to the top at all times, and the
//          next header pushes it off smoothly (native CSS sticky handoff).
//   LEFT:  the pinned header visibly creeps away from the top and snaps
//          back when scrolling settles; header-to-header transitions jump
//          instead of pushing off.
//
// The gap grows with scroll speed and with JS-thread load (e.g. throttle the
// CPU 4x/6x in Chrome DevTools Performance tab to exaggerate it).

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

  return (
    <View style={styles.root}>
      <View style={styles.column}>
        <Text style={styles.columnTitle}>@legendapp/list — sticky lags on web</Text>
        <LegendList
          style={styles.list}
          data={rows}
          keyExtractor={(row) => `${row.type}-${row.section}-${row.label}`}
          getItemType={(row) => row.type}
          getFixedItemSize={(row) => (row.type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT)}
          estimatedItemSize={ITEM_HEIGHT}
          stickyHeaderIndices={stickyIndices}
          renderItem={({ item }) => renderRow(item)}
        />
      </View>

      <View style={styles.separator} />

      <View style={styles.column}>
        <Text style={styles.columnTitle}>RN ScrollView — CSS sticky, no lag</Text>
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
