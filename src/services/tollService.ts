import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp, 
  increment,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Vehicle, Transaction, OperationType } from '../types';
import { normalizePlate } from '../lib/utils';

// Local Fallback Data for when Firebase is offline
const LOCAL_STORAGE_KEY = 'smart_toll_local_data';
const getLocalData = () => {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : { vehicles: [], transactions: [] };
};
const saveLocalData = (data: any) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
};

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const TOLL_RATES: Record<string, number> = {
  car: 50,
  motorcycle: 20,
  bus: 100,
  truck: 150
};

export async function getVehicle(plateNumber: string): Promise<Vehicle | null> {
  const normalized = normalizePlate(plateNumber);
  const path = `vehicles/${normalized}`;
  try {
    const docRef = doc(db, 'vehicles', normalized);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as Vehicle;
    }
    // Fallback to local
    const local = getLocalData();
    return local.vehicles.find((v: any) => v.plateNumber === plateNumber) || null;
  } catch (error) {
    console.warn("Firestore offline, using local fallback");
    const local = getLocalData();
    return local.vehicles.find((v: any) => v.plateNumber === plateNumber) || null;
  }
}

export async function processToll(plateNumber: string, vehicleType: string): Promise<Transaction> {
  const normalized = normalizePlate(plateNumber);
  const vehicle = await getVehicle(normalized);
  const amount = TOLL_RATES[vehicleType] || 50;
  
  let status: 'approved' | 'rejected' = 'rejected';
  let reason = '';

  if (!vehicle) {
    reason = 'Vehicle not registered';
  } else if (vehicle.status !== 'active') {
    reason = 'Vehicle account suspended';
  } else if (vehicle.balance < amount) {
    reason = 'Insufficient balance';
  } else {
    status = 'approved';
    reason = 'Toll processed successfully';
  }

  const transaction: Transaction = {
    plateNumber,
    vehicleType,
    amount,
    timestamp: serverTimestamp(),
    status,
    reason
  };

  const transPath = 'transactions';
  try {
    const transRef = doc(collection(db, transPath));
    await setDoc(transRef, transaction);
    
    if (status === 'approved') {
      const vehicleRef = doc(db, 'vehicles', plateNumber);
      await updateDoc(vehicleRef, {
        balance: increment(-amount)
      });
    }
  } catch (error) {
    console.warn("Firestore write failed, saving locally");
    const local = getLocalData();
    local.transactions.unshift(transaction);
    if (status === 'approved') {
      const idx = local.vehicles.findIndex((v: any) => v.plateNumber === plateNumber);
      if (idx !== -1) local.vehicles[idx].balance -= amount;
    }
    saveLocalData(local);
  }

  return transaction;
}

export function subscribeToTransactions(callback: (transactions: Transaction[]) => void) {
  const q = query(
    collection(db, 'transactions'),
    orderBy('timestamp', 'desc'),
    limit(50)
  );

  return onSnapshot(q, (snapshot) => {
    const transactions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Transaction[];
    callback(transactions);
  }, (error) => {
    console.warn("Transactions subscription failed, using local data");
    const local = getLocalData();
    callback(local.transactions);
  });
}

export async function addVehicle(vehicle: Omit<Vehicle, 'createdAt'>): Promise<void> {
  const normalized = normalizePlate(vehicle.plateNumber);
  const path = `vehicles/${normalized}`;
  try {
    await setDoc(doc(db, 'vehicles', normalized), {
      ...vehicle,
      plateNumber: normalized,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Add vehicle failed, saving locally");
    const local = getLocalData();
    local.vehicles.unshift({ ...vehicle, createdAt: Date.now() });
    saveLocalData(local);
  }
}

export async function updateVehicleStatus(plateNumber: string, status: 'active' | 'suspended'): Promise<void> {
  const path = `vehicles/${plateNumber}`;
  try {
    const vehicleRef = doc(db, 'vehicles', plateNumber);
    await updateDoc(vehicleRef, { status });
  } catch (error) {
    console.warn("Update status failed, saving locally");
    const local = getLocalData();
    const idx = local.vehicles.findIndex((v: any) => v.plateNumber === plateNumber);
    if (idx !== -1) local.vehicles[idx].status = status;
    saveLocalData(local);
  }
}

export function subscribeToAllVehicles(callback: (vehicles: Vehicle[]) => void) {
  const q = query(
    collection(db, 'vehicles'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(q, (snapshot) => {
    const vehicles = snapshot.docs.map(doc => doc.data() as Vehicle);
    callback(vehicles);
  }, (error) => {
    console.warn("Vehicles subscription failed, using local data");
    const local = getLocalData();
    callback(local.vehicles);
  });
}
export async function deleteVehicle(plateNumber: string): Promise<void> {
  const path = `vehicles/${plateNumber}`;
  try {
    const vehicleRef = doc(db, 'vehicles', plateNumber);
    await deleteDoc(vehicleRef);
  } catch (error) {
    console.warn("Delete failed, removing locally");
    const local = getLocalData();
    local.vehicles = local.vehicles.filter((v: any) => v.plateNumber !== plateNumber);
    saveLocalData(local);
  }
}

// Deprecated: use clearAllTransactions instead
export async function clearTransactions(): Promise<void> {
  const q = query(collection(db, 'transactions'), limit(10));
  try {
    const snapshot = await onSnapshot(q, async (snap) => {
      // In a real high-volume app we'd use a batch, but for small demo:
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'transactions', d.id));
      }
    });
    // This is a one-off for demo, so we'll just return. 
    // In strict sense, snapshot isn't the best here, but for simple 'clear' it works if we use getDocs.
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'transactions');
  }
}

// better version using getDocs for one-off delete
export async function clearAllTransactions(): Promise<void> {
  try {
    const q = query(collection(db, 'transactions'), limit(50));
    const snapshot = await getDocs(q);
    for (const d of snapshot.docs) {
      await deleteDoc(doc(db, 'transactions', d.id));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'transactions');
  }
}

export async function seedTestData() {
  const testVehicles = [
    { plateNumber: 'TN01AB1234', ownerName: 'Adithiya',   vehicleType: 'car',        balance: 500,  status: 'active' },
    { plateNumber: 'KA01ME1234', ownerName: 'Operator',   vehicleType: 'car',        balance: 500,  status: 'active' },
    { plateNumber: 'TN02XY9999', ownerName: 'Test User',  vehicleType: 'truck',      balance: 1000, status: 'active' },
    { plateNumber: 'DL01ZZ0001', ownerName: 'Low Balance',vehicleType: 'bus',        balance: 10,   status: 'active' },
    { plateNumber: 'MH02CD5678', ownerName: 'Mumbai User',vehicleType: 'motorcycle', balance: 200,  status: 'active' },
  ];

  let useFirestore = true;
  const errors: string[] = [];

  // Quick test: Try to seed first vehicle to Firestore with a 2-second timeout
  try {
    const firstVehicle = testVehicles[0];
    const normalized = normalizePlate(firstVehicle.plateNumber);
    
    // Race Firestore write against a 2-second timeout
    await Promise.race([
      setDoc(doc(db, 'vehicles', normalized), {
        ...firstVehicle,
        plateNumber: normalized,
        createdAt: serverTimestamp()
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2000))
    ]);
    
    // If first vehicle succeeded, continue with rest
    let successCount = 1;
    
    for (const v of testVehicles.slice(1)) {
      try {
        const normalized = normalizePlate(v.plateNumber);
        await Promise.race([
          setDoc(doc(db, 'vehicles', normalized), {
            ...v,
            plateNumber: normalized,
            createdAt: serverTimestamp()
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2000))
        ]);
        successCount++;
      } catch (e: any) {
        console.warn(`[Seed] Firestore failed for ${v.plateNumber}:`, e?.message);
        errors.push(`${v.plateNumber}: ${e?.message || e}`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(
        `Seeded ${successCount}/${testVehicles.length} vehicles.\nFailed:\n${errors.join('\n')}`
      );
    }
    
    return successCount;
    
  } catch (e: any) {
    console.warn(`[Seed] Firestore failed for initial test, switching to local mode:`, e?.message);
    useFirestore = false;
  }

  // If Firestore failed, seed to local storage instead
  if (!useFirestore) {
    try {
      const localData = getLocalData();
      let successCount = 0;
      const localErrors: string[] = [];
      
      for (const v of testVehicles) {
        try {
          const normalized = normalizePlate(v.plateNumber);
          
          // Remove if already exists
          localData.vehicles = localData.vehicles.filter((existing: any) => existing.plateNumber !== normalized);
          
          // Add the vehicle
          localData.vehicles.push({
            ...v,
            plateNumber: normalized,
            createdAt: new Date().toISOString()
          });
          
          successCount++;
        } catch (e: any) {
          console.error(`[Seed-Local] Failed for ${v.plateNumber}:`, e);
          localErrors.push(`${v.plateNumber}: ${e?.message || e}`);
        }
      }
      
      saveLocalData(localData);
      
      if (localErrors.length > 0) {
        throw new Error(
          `Seeded ${successCount}/${testVehicles.length} vehicles (local storage).\nFailed:\n${localErrors.join('\n')}`
        );
      }
      
      return successCount;
    } catch (e: any) {
      console.error(`[Seed-Local] Storage error:`, e);
      throw new Error(`Local storage seeding failed: ${e?.message || e}`);
    }
  }
}


