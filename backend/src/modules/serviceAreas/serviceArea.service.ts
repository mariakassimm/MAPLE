import { AppError, isDuplicateKeyError } from '../../common/errors';
import { normalizeCity } from '../../common/geo';
import { ServiceArea, type IServiceArea, type ServiceAreaLean } from './serviceArea.model';

export const resolveServiceArea = (city: string, province: string) =>
  ServiceArea.findOne({ cityKey: normalizeCity(city), province, isActive: true }).lean<ServiceAreaLean>();

export const listActiveAreas = () =>
  ServiceArea.find({ isActive: true }).sort({ province: 1, city: 1 }).lean<ServiceAreaLean[]>();
export const listAllAreas = () => ServiceArea.find().sort({ province: 1, city: 1 }).lean<ServiceAreaLean[]>();

type AreaInput = Pick<IServiceArea, 'city' | 'province'> &
  Partial<Pick<IServiceArea, 'isActive' | 'codAvailable' | 'couriers' | 'note'>>;

export async function createArea(input: AreaInput) {
  try {
    return await ServiceArea.create({ ...input, cityKey: normalizeCity(input.city) });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'CONFLICT', 'This city is already in the coverage table.');
    throw err;
  }
}

export async function updateArea(id: string, patch: Partial<AreaInput>) {
  const area = await ServiceArea.findById(id);
  if (!area) throw new AppError(404, 'NOT_FOUND', 'Service area not found.');
  const { couriers, ...rest } = patch;
  area.set(rest);
  // Set each flag individually so patching one courier never resets the other.
  for (const [name, value] of Object.entries(couriers ?? {}))
    if (value !== undefined) area.set(`couriers.${name}`, value);
  if (patch.city) area.cityKey = normalizeCity(patch.city);
  try {
    await area.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'CONFLICT', 'This city is already in the coverage table.');
    throw err;
  }
  return area;
}
