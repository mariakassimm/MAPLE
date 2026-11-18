import { connectDb, disconnectDb } from '../src/config/db';
import { normalizeCity, type Province } from '../src/common/geo';
import { ServiceArea } from '../src/modules/serviceAreas/serviceArea.model';

// DEVELOPMENT PLACEHOLDER ONLY. This is not real courier coverage. Before launch, replace it with the cities and
// COD eligibility that TCS and Leopards confirm in writing (SRS 8.6), using the admin service-area endpoints.
const CITIES: [string, Province][] = [
  ['Karachi', 'Sindh'], ['Hyderabad', 'Sindh'], ['Lahore', 'Punjab'], ['Faisalabad', 'Punjab'], ['Rawalpindi', 'Punjab'],
  ['Multan', 'Punjab'], ['Gujranwala', 'Punjab'], ['Islamabad', 'Islamabad Capital Territory'], ['Peshawar', 'Khyber Pakhtunkhwa'], ['Quetta', 'Balochistan'],
];

async function main() {
  await connectDb();
  try {
    for (const [city, province] of CITIES) {
      // $setOnInsert: re-running never overwrites rows an admin has already edited.
      await ServiceArea.updateOne(
        { cityKey: normalizeCity(city), province },
        { $setOnInsert: { city, province, isActive: true, codAvailable: true, couriers: { tcs: true, leopards: false }, note: 'DEV PLACEHOLDER: replace with courier-confirmed coverage' } },
        { upsert: true },
      );
    }
    console.log(`Seeded ${CITIES.length} placeholder service areas (existing rows untouched).`);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
