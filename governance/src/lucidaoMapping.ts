import { Address, BigInt } from "@graphprotocol/graph-ts"
import {
  Lucidao,
  Approval,
  DelegateChanged,
  DelegateVotesChanged,
  Transfer
} from "../generated/Lucidao/Lucidao"
import { HolderVotingPower } from "../generated/schema"


function getOrCreateHolderEntity(holderId: Address): HolderVotingPower {
  let holderEntity = HolderVotingPower.load(holderId.toHex())

  if (!holderEntity) {
    holderEntity = new HolderVotingPower(holderId.toHex())
  }
  return holderEntity;
}


export function handleApproval(event: Approval): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
}

export function handleDelegateChanged(event: DelegateChanged): void {
  // event.params.delegator
  // event.params.fromDelegate
  // event.params.toDelegate
}

export function handleDelegateVotesChanged(event: DelegateVotesChanged): void {
  const holderEntity = getOrCreateHolderEntity(event.params.delegate);
  holderEntity.holder = event.params.delegate;
  holderEntity.balance = event.params.newBalance;
  holderEntity.blockNumber = event.block.number;
  holderEntity.save();
}

export function handleTransfer(event: Transfer): void {
}
