
import * as dotenv from 'dotenv'
dotenv.config()

import {SuiClient, SuiObjectData, SuiObjectResponse, getFullnodeUrl} from "@mysten/sui/client"
import { Transaction, } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// import { Ed25519Keypair, JsonRpcProvider, Connection, TransactionBlock } from '@mysten/sui/transactions';
// import { expect } from 'chai';

// Initialize provider (testnet or devnet)
const rpcUrl = getFullnodeUrl('localnet');
const client = new SuiClient({ url: rpcUrl });

// Replace this with your private key securely stored
const ADMIN_PRIVATE_KEY: string = process.env.ADMIN_PRIVATE_KEY!;
const adminKeypair = Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(ADMIN_PRIVATE_KEY, 'hex')));
const AssetmanPkg: string = process.env.PACKAGE_ID!; // Replace with your deployed package ID

async function getOwnedObjects(owner: string, type?: string): Promise<SuiObjectResponse[]> {
	let result: SuiObjectResponse[] = [];
	let cursor;
	let filter = !! type ? {StructType: type} : null;
	while(true) {
		let {data, nextCursor, hasNextPage} = await client.getOwnedObjects({
			owner: adminKeypair.getPublicKey().toSuiAddress(),
			filter,
			options:{
				showType: true,
			},
			cursor
		});
		result = [...result, ...data];
		cursor = nextCursor;
		if(!hasNextPage)
			break;
	}
	return result;
}

async function mergeCoins(into: SuiObjectResponse, coinsToMerge: SuiObjectResponse[], payment: SuiObjectResponse) {
    const tx = new Transaction();

	tx.mergeCoins(
		tx.object(into.data?.objectId!), 
		coinsToMerge.map(c => tx.object(c.data?.objectId!))
	);
	tx.setGasPayment([payment.data!]);
	tx.setGasBudget(2000000);

    return await client.signAndExecuteTransaction({
		transaction: tx,
		signer: adminKeypair,
		requestType: 'WaitForLocalExecution',
		options: {
			showEffects: true,
			showEvents: true,
		},
    });
}

async function run() {
	const adminAddress = adminKeypair.getPublicKey().toSuiAddress();

	const [sudoCap] = await getOwnedObjects(
		adminAddress,
		`${AssetmanPkg}::assetman::Sudo<${AssetmanPkg}::assetman::ASSETMAN>` 
	);

	const [suiCoin1, suiCoin2, ...suiExtra] = await getOwnedObjects(
		adminAddress,
		`0x2::coin::Coin<0x2::sui::SUI>`
	)

	console.dir({sudoCap, suiCoin1, suiCoin2, suiExtra}, {depth: 6})
	// return;

	// let mergeResult = await mergeCoins(suiCoin2, suiExtra, suiCoin1);
	// console.log("merge result");
	// console.dir(mergeResult, {depth: 6});
	// return;

    const tx = new Transaction();

	let [initCoin] = tx.splitCoins(
		suiCoin1.data!.objectId!, 
		[tx.pure.u64(100)]
	);
	
    tx.moveCall({
		target: `${AssetmanPkg}::assetman::add_vault`,
		arguments: [
			tx.object(sudoCap.data?.objectId!),
			initCoin
		],
		typeArguments: [
			"0x2::sui::SUI"
		]
    });

	tx.setGasPayment([suiCoin2.data!]);
	tx.setGasBudget(50000000);

	console.log("executing transaction ...");
    const result = await client.signAndExecuteTransaction({
		transaction: tx,
		signer: adminKeypair,
		requestType: 'WaitForLocalExecution',
		options: {
			showEffects: true,
			showEvents: true,
		},
    });

    console.log('Transaction Result:');
	console.dir(result, {depth: 6});
	console.log("Status: ", result.effects?.status);
    // // expect(result.effects?.status?.status).to.equal('success');
}

run()
	.catch(e => console.log(e))
	.finally(() => {
		process.exit(0)
	})

// describe('Sui Smart Contract Tests', () => {
  
//   it('should call the init function successfully', async () => {});

//   it('should deposit coins successfully', async () => {
//     const tx = new TransactionBlock();

//     // Replace with your smart contract details
//     const packageId: string = process.env.PACKAGE_ID!;
//     const moduleName: string = 'escrow';
//     const functionName: string = 'deposit';

//     // Replace with actual object IDs for the vault and user's coin
//     const vaultId: string = 'vault_object_id';
//     const userCoinId: string = 'user_coin_object_id';
//     const depositAmount: number = 50;

//     tx.moveCall({
//       target: `${packageId}::${moduleName}::${functionName}`,
//       arguments: [
//         tx.object(vaultId),        // Vault object ID
//         tx.object(userCoinId),     // User's coin object ID
//         tx.pure(depositAmount),    // Amount to deposit
//       ],
//     });

//     // Sign and execute transaction
//     const result = await provider.signAndExecuteTransactionBlock({
//       signer: adminKeypair,
//       transactionBlock: tx,
//     });

//     console.log('Deposit Transaction Result:', result);
//     expect(result.effects?.status?.status).to.equal('success');
//   });

// });
