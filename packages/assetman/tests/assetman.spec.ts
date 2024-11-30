import * as dotenv from 'dotenv'
dotenv.config()

import path from 'path'
import * as frost from '../samples/frost';
import { execSync } from 'child_process';
import { getFullnodeUrl, SuiClient, SuiObjectResponse } from '@mysten/sui/client';
import { Transaction, } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getOwnedObjects, hex256, listVaults, mergeCoins } from '../samples/utils';
import {bcs} from '@mysten/bcs'


const adminKeypair = Ed25519Keypair.fromSecretKey(
	Uint8Array.from(Buffer.from(process.env.ADMIN_PRIVATE_KEY!, 'hex'))
);
const userKeypair = Ed25519Keypair.fromSecretKey(
	Uint8Array.from(Buffer.from(process.env.USER_PRIVATE_KEY!, 'hex'))
);

async function publish(pkg: "assetman"|"coin"): Promise<string> {
	const cwd = path.join(__dirname, `../../${pkg}`);
	const publishOutput = execSync(
		`sui client publish --gas-budget 100000000 --json`, 
		{ encoding: 'utf-8' ,cwd}
	);
	const publishResult = JSON.parse(publishOutput);

	// @ts-ignore
	const publishedModules = publishResult.objectChanges.filter(({type}) => type == 'published')
	return publishedModules[0].packageId
}

async function mintSampleCoin(
	client: SuiClient, 
	keypair: Ed25519Keypair,
	payment: SuiObjectResponse,
	packageId: string,
	treasuryCap: SuiObjectResponse, 
	recipient: string[],
	amount: number[],
) {
	const tx = new Transaction()
	for(let i=0; i<amount.length; i++) {
		tx.moveCall({
			target: `${packageId}::coin::mint`,
			arguments: [
				tx.object(treasuryCap.data?.objectId!),
				tx.pure.u64(amount[i]),
				tx.pure.address(recipient[i]),
			]
		})
	}

	tx.setGasPayment([payment.data!]);
	tx.setGasBudget(5000000*amount.length);

    const result = await client.signAndExecuteTransaction({
		transaction: tx,
		signer: keypair,
		requestType: 'WaitForLocalExecution',
		options: {
			showEffects: true,
			showEvents: true,
		},
    });
	// console.dir(result, {depth: 6})

	return result
}

function balanceChange(before: SuiObjectResponse, after: SuiObjectResponse): number {
	//@ts-ignore
	return before.data?.content.fields.balance - after.data?.content.fields.balance
}

function totalBalance(list: SuiObjectResponse[]): number {
	return list.reduce(
		//@ts-ignore
		(acc, current) => acc + parseInt(current.data?.content.fields.balance),
		0
	)
}

describe('Assetman', () => {
	let assetmanPkgId: string;
	let coin1PkgId: string;
	let client: SuiClient;
	let admin: string;
	let user: string;
	let frostGroup: any;
	let frostPubKey: string;

    beforeAll(async () => {
		// deploy
		assetmanPkgId = await publish('assetman');
		coin1PkgId = await publish('coin');

		admin = adminKeypair.getPublicKey().toSuiAddress();
		user = userKeypair.getPublicKey().toSuiAddress();

		frostGroup = frost.keyGen(5, 3);
		frostPubKey = frostGroup.pubkeyPackage.verifying_key;

		const rpcUrl = getFullnodeUrl('localnet');
		client = new SuiClient({ url: rpcUrl });
    });

    beforeEach(async () => {
    });

    it('Should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and assetman are ready to use
    });

	it("Adding vault by non sudo user, should be failed.", async () => {
		const [sudoCap] = await getOwnedObjects(
			client,
			admin,
			`${assetmanPkgId}::assetman::Sudo<${assetmanPkgId}::assetman::ASSETMAN>` 
		);
		expect(sudoCap).toBeDefined();

		const allSuiCoins = await getOwnedObjects(
			client,
			user,
			`0x2::coin::Coin<0x2::sui::SUI>`,
			{showContent: true}
		)
		// sort by balance
		allSuiCoins.sort(balanceChange).reverse();

		expect(allSuiCoins[0]).toBeDefined();
		expect(allSuiCoins[1]).toBeDefined();

		const tx = new Transaction();

		let [initCoin] = tx.splitCoins(
			allSuiCoins[0].data!.objectId!, 
			[tx.pure.u64(100)]
		);
		
		tx.moveCall({
			target: `${assetmanPkgId}::assetman::add_vault`,
			arguments: [
				tx.object(sudoCap.data?.objectId!),
				tx.pure.vector("u8", Array.from(Buffer.from(frostPubKey, 'hex'))),
				initCoin
			],
			typeArguments: [
				"0x2::sui::SUI"
			]
		});

		tx.setGasPayment([allSuiCoins[1].data!]);
		tx.setGasBudget(50000000);

		try {
			await client.signAndExecuteTransaction({
				transaction: tx,
				signer: adminKeypair,
				requestType: 'WaitForLocalExecution',
				options: {
					showEffects: true,
					showEvents: true,
				},
			});

			throw new Error('Add vault transaction did not fail as expected');
		}
		catch(error) {
			//@ts-ignore
			expect(error.message).toContain('Transaction was not signed by the correct sender');
		}
	})

	it("Add SUI coin vault, should work", async () => {
		const [sudoCap] = await getOwnedObjects(
			client,
			admin,
			`${assetmanPkgId}::assetman::Sudo<${assetmanPkgId}::assetman::ASSETMAN>` 
		);
		expect(sudoCap).toBeDefined();

		const allSuiCoins = await getOwnedObjects(
			client,
			admin,
			`0x2::coin::Coin<0x2::sui::SUI>`,
			{showContent: true}
		)
		// sort by balance
		allSuiCoins.sort(balanceChange).reverse();

		expect(allSuiCoins[0]).toBeDefined();
		expect(allSuiCoins[1]).toBeDefined();

		// console.dir({sudoCap, suiCoin1, suiCoin2, suiExtra}, {depth: 6})
		// return;

		// let mergeResult = await mergeCoins(client, adminKeypair, suiCoin2, suiExtra, suiCoin1);
		// console.log("merge result");
		// console.dir(mergeResult, {depth: 6});
		// return;

		const tx = new Transaction();

		let [initCoin] = tx.splitCoins(
			allSuiCoins[0].data!.objectId!, 
			[tx.pure.u64(100)]
		);
		
		tx.moveCall({
			target: `${assetmanPkgId}::assetman::add_vault`,
			arguments: [
				tx.object(sudoCap.data?.objectId!),
				initCoin,
				bcs.vector(bcs.u8()).serialize(Array.from(Buffer.from(frostPubKey, 'hex'))),
			],
			typeArguments: [
				"0x2::sui::SUI"
			]
		});

		tx.setGasPayment([allSuiCoins[1].data!]);
		tx.setGasBudget(50000000);

		const result = await client.signAndExecuteTransaction({
			transaction: tx,
			signer: adminKeypair,
			requestType: 'WaitForLocalExecution',
			options: {
				showEffects: true,
				showEvents: true,
			},
		});
		expect(result.effects?.status.status).toBe("success")

		const vaultAddEvent = result.events?.filter(e => {
			return e.type === `${assetmanPkgId}::assetman::VaultAddEvent` &&
				//@ts-ignore
				e.parsedJson?.coin === `${hex256('0x2')}::sui::SUI`
		})
		expect(vaultAddEvent).toBeDefined()

		// console.log('Transaction Result:');
		// console.dir(result, {depth: 6});
	})

	it("Sample custom coin mint, should work", async () => {
		const allSuiCoins = await getOwnedObjects(
			client,
			admin,
			`0x2::coin::Coin<0x2::sui::SUI>`,
			{showContent: true}
		)
		// sort by balance
		allSuiCoins.sort(balanceChange).reverse();
		const gasCoin = allSuiCoins[0];
		expect(gasCoin).toBeDefined()

		const [coin1Cap] = await getOwnedObjects(
			client,
			admin,
			`0x2::coin::TreasuryCap<${coin1PkgId}::coin::COIN>`,
			{showContent: true},
		)
		expect(coin1Cap).toBeDefined()
		
		await mintSampleCoin(
			client,
			adminKeypair,
			gasCoin,
			coin1PkgId,
			coin1Cap,
			[admin, user],
			[10_000, 10_000],
		)

		const [coin1Cap2] = await getOwnedObjects(
			client,
			admin,
			`0x2::coin::TreasuryCap<${coin1PkgId}::coin::COIN>`,
			{showContent: true}
		)
		//@ts-ignore
		expect(parseInt(coin1Cap2.data?.content.fields.total_supply.fields.value)).toBe(20_000);
	})

	it("Adding Vault for custom coins, should work", async () => {
		const [sudoCap] = await getOwnedObjects(
			client,
			admin,
			`${assetmanPkgId}::assetman::Sudo<${assetmanPkgId}::assetman::ASSETMAN>` 
		);
		expect(sudoCap).toBeDefined();

		const allSuiCoins = await getOwnedObjects(
			client,
			admin,
			`0x2::coin::Coin<0x2::sui::SUI>`,
			{showContent: true}
		)
		// sort by balance
		allSuiCoins.sort(balanceChange).reverse();
		const gasCoin = allSuiCoins[0]
		expect(gasCoin).toBeDefined()

		const [coin1] = await getOwnedObjects(
			client,
			admin,
			`0x2::coin::Coin<${coin1PkgId}::coin::COIN>`,
			{showContent: true},
		)
		expect(coin1).toBeDefined()
		// expect(coin2).toBeDefined()

		const tx = new Transaction();

		let [initCoin] = tx.splitCoins(
			coin1.data!.objectId!, 
			[tx.pure.u64(100)]
		);
		
		tx.moveCall({
			target: `${assetmanPkgId}::assetman::add_vault`,
			arguments: [
				tx.object(sudoCap.data?.objectId!),
				initCoin,
				tx.pure.vector("u8", Array.from(Buffer.from(frostPubKey, 'hex'))),
			],
			typeArguments: [
				`${coin1PkgId}::coin::COIN`
			]
		});

		tx.setGasPayment([gasCoin.data!]);
		tx.setGasBudget(50000000);

		const result = await client.signAndExecuteTransaction({
			transaction: tx,
			signer: adminKeypair,
			requestType: 'WaitForLocalExecution',
			options: {
				showEffects: true,
				showEvents: true,
			},
		});
		expect(result.effects?.status.status).toBe("success")

		const vaultAddEvent = result.events?.filter(e => {
			return e.type === `${assetmanPkgId}::assetman::VaultAddEvent` &&
				//@ts-ignore
				e.parsedJson?.coin === `${hex256(coin1PkgId)}::coin::COIN`
		})
		expect(vaultAddEvent).toBeDefined()


	})

	it("Listing vaults, should work", async () => {
		const vaults = await listVaults(client, assetmanPkgId);
		expect(vaults.length).toBe(2);
	})

	it("SUI coin deposit, should work", async () => {
		const [suiVault] = await listVaults(client, assetmanPkgId, `0x2::sui::SUI`);

		let allSuiCoins = await getOwnedObjects(
			client, 
			user, 
			"0x2::coin::Coin<0x2::sui::SUI>",
			{showContent: true}
		)
		// sort by balance
		allSuiCoins.sort(balanceChange).reverse();
		const [sui1, sui2] = allSuiCoins;

		const tx = new Transaction();
		
		tx.moveCall({
			target: `${assetmanPkgId}::assetman::deposit`,
			arguments: [
				tx.object(suiVault.data?.objectId!),
				tx.object(sui2.data?.objectId!),
				tx.pure.u64(250)
			],
			typeArguments: [
				`0x2::sui::SUI`
			]
		});

		tx.setGasPayment([sui1.data!]);
		tx.setGasBudget(50000000);

		const result = await client.signAndExecuteTransaction({
			transaction: tx,
			signer: userKeypair,
			requestType: 'WaitForLocalExecution',
			options: {
				showEffects: true,
				showEvents: true,
			},
		});
		// console.log(result.effects?.status);
		expect(result.effects?.status.status).toBe("success")

		const [updatedSuiVault] = await listVaults(client, assetmanPkgId, `0x2::sui::SUI`);
		//@ts-ignore
		expect(updatedSuiVault.data?.content.fields.balance).toBe("350")

		const updatedSui1 = await client.getObject({id: sui2.data?.objectId!, options: {showContent: true}});
		expect(balanceChange(sui2, updatedSui1)).toBe(250)
	})

	it("Custom coin deposit, should work", async () => {
		const [coinVault] = await listVaults(client, assetmanPkgId, `${coin1PkgId}::coin::COIN`);
		// for gass payment
		let allSuiCoins = await getOwnedObjects(
			client, 
			user, 
			"0x2::coin::Coin<0x2::sui::SUI>",
			{showContent: true}
		)
		// sort by balance
		allSuiCoins.sort(balanceChange).reverse();
		
		// for deposit
		let [coin] = await getOwnedObjects(
			client, 
			user, 
			`0x2::coin::Coin<${coin1PkgId}::coin::COIN>`,
			{showContent: true}
		)

		const tx = new Transaction();
		
		tx.moveCall({
			target: `${assetmanPkgId}::assetman::deposit`,
			arguments: [
				tx.object(coinVault.data?.objectId!),
				tx.object(coin.data?.objectId!),
				tx.pure.u64(250)
			],
			typeArguments: [
				`${coin1PkgId}::coin::COIN`
			]
		});

		tx.setGasPayment([allSuiCoins[0].data!]);
		tx.setGasBudget(50000000);

		const result = await client.signAndExecuteTransaction({
			transaction: tx,
			signer: userKeypair,
			requestType: 'WaitForLocalExecution',
			options: {
				showEffects: true,
				showEvents: true,
			},
		});
		// console.log(result.effects?.status);
		expect(result.effects?.status.status).toBe("success")

		const [updatedCoinVault] = await listVaults(client, assetmanPkgId, `${coin1PkgId}::coin::COIN`);
		//@ts-ignore
		expect(updatedCoinVault.data?.content.fields.balance).toBe("350")

		const updatedCoin = await client.getObject({id: coin.data?.objectId!, options: {showContent: true}});
		expect(balanceChange(coin, updatedCoin)).toBe(250)
	})

	it("Withdraw with wrong signature, should be failed", async () => {
		const withdrawMessage = "dont allow withdraw";
		const messageBuff = Buffer.from(withdrawMessage, 'utf-8');
		const withdrawAmount = 150;

		let signature:string = frost.signFrost(messageBuff, frostGroup.keyPackages, frostGroup.pubkeyPackage);

		const [suiVault] = await listVaults(client, assetmanPkgId, `0x2::sui::SUI`);

		let allSuiCoins = await getOwnedObjects(
			client, 
			user, 
			"0x2::coin::Coin<0x2::sui::SUI>",
			{showContent: true}
		)
		// sort by balance
		allSuiCoins.sort(balanceChange).reverse();

		const tx = new Transaction();
		
		let [withdrowedCoin] = tx.moveCall({
			target: `${assetmanPkgId}::assetman::withdraw`,
			arguments: [
				tx.object(suiVault.data?.objectId!),
				tx.pure.u64(withdrawAmount),
				tx.pure.vector("u8", Array.from(Buffer.from(signature, 'hex'))),
			],
			typeArguments: [
				`0x2::sui::SUI`
			]
		});
		tx.transferObjects([withdrowedCoin], tx.pure.address(user));

		tx.setGasPayment([allSuiCoins[0].data!]);
		tx.setGasBudget(50000000);

		const result = await client.signAndExecuteTransaction({
			transaction: tx,
			signer: userKeypair,
			requestType: 'WaitForLocalExecution',
			options: {
				showEffects: true,
				showEvents: true,
			},
		});
		//@ts-ignore
		expect(result.effects?.status.status).toBe('failure');
		//@ts-ignore
		expect(result.effects?.status.error).toContain('MoveAbort');

	})

	it("SUI coin withdraw, should work", async () => {
		const withdrawMessage = "allow withdraw";
		const messageBuff = Buffer.from(withdrawMessage, 'utf-8');
		const withdrawAmount = 150;

		let signature:string = frost.signFrost(messageBuff, frostGroup.keyPackages, frostGroup.pubkeyPackage);

		const [suiVault] = await listVaults(client, assetmanPkgId, `0x2::sui::SUI`);

		let allSuiCoins = await getOwnedObjects(
			client, 
			user, 
			"0x2::coin::Coin<0x2::sui::SUI>",
			{showContent: true}
		)
		// sort by balance
		allSuiCoins.sort(balanceChange).reverse();

		const tx = new Transaction();
		
		let [withdrowedCoin] = tx.moveCall({
			target: `${assetmanPkgId}::assetman::withdraw`,
			arguments: [
				tx.object(suiVault.data?.objectId!),
				tx.pure.u64(withdrawAmount),
				tx.pure.vector("u8", Array.from(Buffer.from(signature, 'hex'))),
			],
			typeArguments: [
				`0x2::sui::SUI`
			]
		});
		tx.transferObjects([withdrowedCoin], tx.pure.address(user));

		tx.setGasPayment([allSuiCoins[0].data!]);
		tx.setGasBudget(50000000);

		const result = await client.signAndExecuteTransaction({
			transaction: tx,
			signer: userKeypair,
			requestType: 'WaitForLocalExecution',
			options: {
				showEffects: true,
				showEvents: true,
			},
		});
		console.log(result.effects?.status);
		expect(result.effects?.status.status).toBe("success")

		const [updatedSuiVault] = await listVaults(client, assetmanPkgId, `0x2::sui::SUI`);
		expect(balanceChange(suiVault, updatedSuiVault)).toBe(withdrawAmount);

		// expect a WithdrawEvent be emmited
		const withdrawEvent = result.events?.filter(e => {
			return e.type === `${assetmanPkgId}::assetman::WithdrawEvent` &&
				//@ts-ignore
				e.parsedJson?.coin === `${hex256('0x2')}::sui::SUI`
		})
		expect(withdrawEvent).toBeDefined()

		let allSuiCoins2 = await getOwnedObjects(
			client, 
			user, 
			"0x2::coin::Coin<0x2::sui::SUI>",
			{showContent: true}
		)

		// check user balance change
		let idList1 = allSuiCoins.map(c => c.data?.objectId);
		let newCoins = allSuiCoins2.filter(c => !idList1.includes(c.data?.objectId))
		expect(totalBalance(newCoins)).toBe(withdrawAmount)
	})

	it("Custom coin withdraw, should work", async () => {
		const withdrawMessage = "allow withdraw";
		const messageBuff = Buffer.from(withdrawMessage, 'utf-8');
		const withdrawAmount = 150;

		let signature:string = frost.signFrost(messageBuff, frostGroup.keyPackages, frostGroup.pubkeyPackage);

		// Load custom coin list and vault.
		const [ccVault] = await listVaults(client, assetmanPkgId, `${coin1PkgId}::coin::COIN`);
		const allCustomCoins = await getOwnedObjects(
			client,
			user,
			`0x2::coin::Coin<${coin1PkgId}::coin::COIN>`,
			{showContent: true}
		)
		// load all sui coins
		let allSuiCoins = await getOwnedObjects(
			client, 
			user, 
			"0x2::coin::Coin<0x2::sui::SUI>",
			{showContent: true}
		)
		// sort by balance
		allSuiCoins.sort(balanceChange).reverse();

		const tx = new Transaction();
		
		let [withdrowedCoin] = tx.moveCall({
			target: `${assetmanPkgId}::assetman::withdraw`,
			arguments: [
				tx.object(ccVault.data?.objectId!),
				tx.pure.u64(withdrawAmount),
				tx.pure.vector("u8", Array.from(Buffer.from(signature, 'hex'))),
			],
			typeArguments: [
				`${coin1PkgId}::coin::COIN`
			]
		});
		tx.transferObjects([withdrowedCoin], tx.pure.address(user));

		tx.setGasPayment([allSuiCoins[0].data!]);
		tx.setGasBudget(50000000);

		const result = await client.signAndExecuteTransaction({
			transaction: tx,
			signer: userKeypair,
			requestType: 'WaitForLocalExecution',
			options: {
				showEffects: true,
				showEvents: true,
			},
		});
		console.log(result.effects?.status);
		expect(result.effects?.status.status).toBe("success")

		const [updatedCCVault] = await listVaults(client, assetmanPkgId, `0x2::sui::SUI`);
		expect(balanceChange(ccVault, updatedCCVault)).toBe(withdrawAmount);

		// expect a WithdrawEvent be emmited
		const withdrawEvent = result.events?.filter(e => {
			return e.type === `${assetmanPkgId}::assetman::WithdrawEvent`
		})
		expect(withdrawEvent).toBeDefined()

		const allCustomCoins2 = await getOwnedObjects(
			client,
			user,
			`0x2::coin::Coin<${coin1PkgId}::coin::COIN>`,
			{showContent: true}
		)

		// check user balance change
		let idList1 = allCustomCoins.map(c => c.data?.objectId);
		let newCoins = allCustomCoins2.filter(c => !idList1.includes(c.data?.objectId))
		expect(totalBalance(newCoins)).toBe(withdrawAmount)
	})
});
