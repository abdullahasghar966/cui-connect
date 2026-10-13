/**
 * Bus routes for the demo campus, with real Islamabad and Rawalpindi stops (drivers and numbers
 * are made up). Usman follows Route 1 from Faizabad; Hira follows nothing yet (the demo).
 */
import { BusRoute, SavedRoute, User } from '../models';

const WEEKDAYS = [1, 2, 3, 4, 5];

const ROUTES = [
  {
    name: 'Route 1: Rawalpindi Saddar',
    bus: 'Bus 1 (coaster)',
    capacity: 30,
    stops: [
      { name: 'Saddar, Bank Road', morning: '06:50', evening: '17:40' },
      { name: 'Committee Chowk', morning: '07:05', evening: '17:25' },
      { name: 'Faizabad', morning: '07:20', evening: '17:10' },
      { name: 'Zero Point', morning: '07:30', evening: '17:00' },
      { name: 'COMSATS, Park Road', morning: '07:55', evening: '16:40' },
    ],
    driverName: 'Muhammad Aslam',
    driverPhone: '0300-0000001',
    notes: 'Leaves campus at 4:40 PM. Show your student card when boarding.',
  },
  {
    name: 'Route 2: Bahria Town and DHA',
    bus: 'Bus 2 (bus)',
    capacity: 50,
    stops: [
      { name: 'Bahria Town Phase 7', morning: '06:45', evening: '17:45' },
      { name: 'DHA Phase 2 Gate', morning: '07:00', evening: '17:30' },
      { name: 'Koral Chowk', morning: '07:25', evening: '17:05' },
      { name: 'COMSATS, Park Road', morning: '07:50', evening: '16:40' },
    ],
    driverName: 'Tariq Mehmood',
    driverPhone: '0300-0000002',
    notes: null,
  },
  {
    name: 'Route 3: G and F sectors',
    bus: 'Bus 3 (coaster)',
    capacity: 30,
    stops: [
      { name: 'G-11 Markaz', morning: '07:00', evening: '17:30' },
      { name: 'G-9 Karachi Company', morning: '07:10', evening: '17:20' },
      { name: 'F-8 Kacheri', morning: '07:20', evening: '17:10' },
      { name: 'Aabpara', morning: '07:30', evening: '17:00' },
      { name: 'COMSATS, Park Road', morning: '07:55', evening: '16:40' },
    ],
    driverName: 'Sajid Hussain',
    driverPhone: '0300-0000003',
    notes: 'Also stops at Shakarparian on request.',
  },
];

export async function seedTransport(): Promise<number> {
  const routes = await BusRoute.insertMany(ROUTES.map((r) => ({ ...r, days: WEEKDAYS })));
  const usman = await User.findOne({ regNo: 'FA23-BCS-031' }).select('_id').lean();
  const first = routes[0];
  if (usman && first) {
    await SavedRoute.create({ userId: usman._id, routeId: first._id, stop: 'Faizabad' });
  }
  return routes.length;
}
