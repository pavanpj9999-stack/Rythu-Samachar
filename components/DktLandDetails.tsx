
import React from 'react';
import { UniversalDataModule } from './UniversalDataModule';

export const DktLandDetails: React.FC = () => {
  return (
    <UniversalDataModule 
      moduleType="DKT_LAND" 
      title="DKT Land Details" 
      description="Manage DKT land records and excel uploads."
    />
  );
};
