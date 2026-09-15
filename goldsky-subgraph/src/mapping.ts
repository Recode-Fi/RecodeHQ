import { BigInt, Address, store } from "@graphprotocol/graph-ts";
import { Transfer } from "../generated/templates/ERC20/ERC20";
import {
  Token,
  TokenBalance,
  Account,
  TransferEvent as TransferEventEntity,
} from "../generated/schema";

/**
 * RECODE ERC-20 holder subgraph mapping (Robinhood Chain via Goldsky).
 * Reconstructs holder balances from genesis Transfer events so
 * tokenBalances / holderCount / transferCount are provably complete
 * for the indexed range.
 */

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function tokenId(address: Address): string {
  return address.toHexString().toLowerCase();
}

function accountId(address: Address): string {
  return address.toHexString().toLowerCase();
}

export function handleTransfer(event: Transfer): void {
  const tokenAddress = event.address;
  const tId = tokenId(tokenAddress);

  // --- ensure token ---
  let token = Token.load(tId);
  if (token == null) {
    token = new Token(tId);
    token.totalSupply = BigInt.fromI32(0);
    token.holderCount = BigInt.fromI32(0);
    token.transferCount = BigInt.fromI32(0);
    // name/symbol/decimals are populated by the deployment script's
    // metadata pass (see README) to avoid eth_calls inside mappings.
  }
  token.transferCount = token.transferCount.plus(BigInt.fromI32(1));

  const fromId = accountId(event.params.from);
  const toId = accountId(event.params.to);
  const isMint = fromId == ZERO_ADDRESS;
  const isBurn = toId == ZERO_ADDRESS;

  // --- from side ---
  if (!isMint) {
    const fromBalId = tId + "-" + fromId;
    let fromBal = TokenBalance.load(fromBalId);
    if (fromBal != null) {
      const next = fromBal.value.minus(event.params.value);
      fromBal.value = next;
      if (next.equals(BigInt.fromI32(0)) || next.le(BigInt.fromI32(0))) {
        token.holderCount = token.holderCount.minus(BigInt.fromI32(1));
        store.remove("TokenBalance", fromBalId);
      } else {
        fromBal.save();
      }
    }
  } else {
    token.totalSupply = token.totalSupply.plus(event.params.value);
  }

  // --- to side ---
  if (!isBurn) {
    const toBalId = tId + "-" + toId;
    let toBal = TokenBalance.load(toBalId);
    if (toBal == null) {
      const account = new Account(toId);
      account.save();
      toBal = new TokenBalance(toBalId);
      toBal.token = tId;
      toBal.account = toId;
      toBal.value = event.params.value;
      token.holderCount = token.holderCount.plus(BigInt.fromI32(1));
    } else {
      toBal.value = toBal.value.plus(event.params.value);
    }
    if (toBal.value.gt(BigInt.fromI32(0))) {
      toBal.save();
    }
  } else {
    token.totalSupply = token.totalSupply.minus(event.params.value);
  }

  // --- transfer event entity (raw; no buy/sell relabeling) ---
  const evId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const ev = new TransferEventEntity(evId);
  ev.token = tId;
  ev.from = fromId;
  ev.to = toId;
  ev.value = event.params.value;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  token.save();
}
