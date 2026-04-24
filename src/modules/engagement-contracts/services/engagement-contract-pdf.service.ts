import PDFDocument from 'pdfkit';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getLogger } from '@logtape/logtape';
import type { SelectEngagementContract } from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import { config } from '@/shared/config';

let r2Client: S3Client | null = null;

const getR2Client = (): S3Client => {
  if (r2Client) return r2Client;
  const { accountId, r2AccessKeyId, r2SecretAccessKey } = config.cloudflare;
  if (!accountId || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error('Cloudflare R2 configuration is missing');
  }
  r2Client = new S3Client({
    region: 'auto',
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  });
  return r2Client;
};

const logger = getLogger(['engagement-contracts', 'pdf-service']);

const generatePdfBuffer = (
  contract: SelectEngagementContract,
  meta: {
    practiceName: string;
    clientName: string;
    matterTitle: string;
    acceptedAt: Date;
    clientIp?: string;
  }
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const buffers: Buffer[] = [];
      const doc = new PDFDocument();

      doc.on('data', (chunk: Buffer) => {
        buffers.push(chunk);
      });

      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      doc.on('error', reject);

      // Title
      doc.fontSize(20).font('Helvetica-Bold').text(meta.practiceName, { align: 'center' });
      doc.fontSize(14).font('Helvetica').text('Engagement Contract', { align: 'center' });
      doc.moveDown();

      // Matter Information
      doc.fontSize(10).font('Helvetica-Bold').text('Matter Information');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Matter: ${meta.matterTitle}`);
      doc.text(`Client: ${meta.clientName}`);
      doc.text(`Accepted: ${meta.acceptedAt.toLocaleDateString()}`);
      doc.moveDown();

      // Contract Body
      doc.fontSize(12).font('Helvetica-Bold').text('Contract Terms');
      doc.fontSize(10).font('Helvetica');
      if (contract.contract_body) {
        doc.text(contract.contract_body, { align: 'left', width: 500 });
      }
      doc.moveDown();

      // Billing Information
      if (contract.billing_snapshot) {
        doc.fontSize(12).font('Helvetica-Bold').text('Billing Information');
        doc.fontSize(10).font('Helvetica');
        const billing = contract.billing_snapshot as Record<string, unknown>;
        Object.entries(billing).forEach(([key, value]) => {
          let displayValue: string;
          if (value === null || value === undefined) {
            displayValue = 'null';
          } else if (typeof value === 'object') {
            displayValue = JSON.stringify(value, null, 2);
          } else {
            displayValue = String(value);
          }
          doc.text(`${key}: ${displayValue}`);
        });
        doc.moveDown();
      }

      // Acceptance Record
      doc.fontSize(12).font('Helvetica-Bold').text('Acceptance Record');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Client: ${meta.clientName}`);
      doc.text(`Accepted: ${meta.acceptedAt.toLocaleString()}`);
      if (meta.clientIp) {
        doc.text(`IP Address: ${meta.clientIp}`);
      }
      doc.moveDown();

      // Footer
      doc.fontSize(8).text('This document was electronically accepted under the E-SIGN Act', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const uploadPdfToR2 = async (params: {
  organizationId: string;
  contractId: string;
  pdfBuffer: Buffer;
}): Promise<string> => {
  const { organizationId, contractId, pdfBuffer } = params;
  const { r2BucketName } = config.cloudflare;

  if (!r2BucketName) {
    throw new Error('Cloudflare R2 bucket name is missing');
  }

  const key = `engagement-contracts/${organizationId}/${contractId}/signed-contract.pdf`;

  try {
    const command = new PutObjectCommand({
      Bucket: r2BucketName,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    });

    await getR2Client().send(command);
    logger.info('PDF uploaded to R2', { key });

    return key;
  } catch (error) {
    logger.error('Failed to upload PDF to R2: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

export const engagementContractPdfService = {
  generatePdfBuffer,
  uploadPdfToR2,
};
