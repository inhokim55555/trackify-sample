import type {DataSource} from './types';
import {MockDataSource} from './mock';export type {DataSource} from './types';export * from './types';export {MockDataSource} from './mock';const sample=new MockDataSource();export function getDataSource():DataSource{return sample;}
