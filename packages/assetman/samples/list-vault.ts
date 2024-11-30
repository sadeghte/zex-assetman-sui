
import * as dotenv from 'dotenv'
dotenv.config()

import {SuiClient, getFullnodeUrl} from "@mysten/sui/client"
import { hex256, listVaults } from './utils';

// import { Ed25519Keypair, JsonRpcProvider, Connection, TransactionBlock } from '@mysten/sui/transactions';
// import { expect } from 'chai';

// Initialize provider (testnet or devnet)
const rpcUrl = getFullnodeUrl('localnet');
const client = new SuiClient({ url: rpcUrl });

const packageId: string = process.env.PACKAGE_ID!; // Replace with your deployed package ID

async function run() {
	let vaults = await listVaults(client, packageId, `${hex256('0x2')}::sui::SUI`);

	console.dir(vaults, {depth: 6})
}

run()
	.catch(e => console.log(e))
	.finally(() => {
		process.exit(0)
	})