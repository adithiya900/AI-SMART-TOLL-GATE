export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export type VehicleType = 'car' | 'truck' | 'bus' | 'motorcycle';
export type VehicleStatus = 'active' | 'suspended';
export type TransactionStatus = 'approved' | 'rejected';

export interface Vehicle {
  plateNumber: string;
  ownerName: string;
  vehicleType: VehicleType;
  balance: number;
  status: VehicleStatus;
  createdAt: any; // Firestore Timestamp
}

export interface Transaction {
  id?: string;
  plateNumber: string;
  vehicleType: string;
  amount: number;
  timestamp: any; // Firestore Timestamp
  status: TransactionStatus;
  reason: string;
}

export interface RecognitionResult {
  plateNumber: string;
  vehicleType: VehicleType;
  confidence: number;
  boundingBox?: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
  croppedImage?: string;
  processingTime?: string;
  error?: string;
}
