import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationError, Nominator, logger } from 'cmpd-common-api';
import makeFirebaseService, { Admin } from '../../../common/services/firebase';
import { sendApproval } from '../../lib/registration';
import { ApproveUserDto } from './dto/approve-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export enum ErrorCodes {
  PhoneNumberExists = 'PhoneNumberExists',
  UserNotFound = 'UserNotFound',
  Unknown = 'Unknown'
}

const determineCode = (code: string) => {
  let errorCode = ErrorCodes.Unknown;
  switch (code) {
    case 'auth/phone-number-already-exists':
      errorCode = ErrorCodes.PhoneNumberExists;
      break;
  }

  return errorCode;
};

@Injectable()
export class AccountService {
  admin: Admin;

  constructor() {
    this.admin = makeFirebaseService();
  }
  async validateUser(idToken: string) {
    const decodedToken = await this.admin.auth().verifyIdToken(idToken);
    const nominator = await Nominator.findOneById(decodedToken.uid);

    if (!nominator) {
      logger.warn('The user could not be found in the database.');
    }

    return { ...nominator, claims: decodedToken.claims };
  }

  async createUser(createUserDto: CreateUserDto) {
    try {
      const { phoneNumber, displayName } = createUserDto;
      const userRecord = await this.admin.auth().createUser({ disabled: false, phoneNumber, displayName });
      const nominator = Nominator.fromJSON(createUserDto);

      nominator.disabled = false;
      nominator.id = userRecord.uid;

      await nominator.save();

      return nominator;
    } catch (error) {
      throw new ApplicationError(error.message);
    }
  }

  async updateUser({ uid, ...rest }: UpdateUserDto, currentUser) {
    if (currentUser.role !== 'admin' && currentUser.id !== uid) {
      throw new ForbiddenException();
    }

    try {
      const { phoneNumber, displayName, email, emailVerified } = rest;
      const user = await Nominator.findOneById(uid);
      await this.admin.auth().updateUser(uid, { phoneNumber, displayName, email, emailVerified });

      if (!user) {
        logger.warn('The user could not be found in the database.');

        throw new NotFoundException();
      }

      user.name = rest.name;
      user.rank = rest.rank;
      user.phoneNumber = rest.phoneNumber;
      user.email = rest.email;
      user.emailVerified = rest.emailVerified;
      user.nominationLimit = rest.nominationLimit;
      user.affiliationId = rest.affiliationId;

      if (currentUser.role === 'admin') {
        await this.admin.auth().setCustomUserClaims(uid, { claims: { nominations: { [rest.role]: true } } });
      }

      return await user.save();
    } catch (error) {
      throw new ApplicationError(error.message);
    }
  }

  async registerUser(registerUserDto: RegisterUserDto, app: string) {
    try {
      const { phoneNumber, displayName } = registerUserDto;
      const firebaseUser = await this.admin.auth().getUserByPhoneNumber(phoneNumber);

      if (!firebaseUser) {
        logger.warn('The user could not be found in firebase.');

        throw new Error('User does not exist');
      }

      await this.admin
        .auth()
        .updateUser(firebaseUser.uid, { displayName, disabled: false, email: registerUserDto.email });

      const nominator = Nominator.fromJSON(registerUserDto);

      nominator.disabled = true;
      nominator.id = firebaseUser.uid;

      await nominator.save();

      sendApproval(app, nominator.name);
      return nominator;
    } catch (error) {
      if (error.code) {
        throw new ApplicationError('Validation error', determineCode(error.code));
      }

      throw new ApplicationError(error.message);
    }
  }

  async approveUser({ uid, nominationLimit }: ApproveUserDto) {
    try {
      await this.admin.auth().updateUser(uid, {
        disabled: false,
        emailVerified: true
      });

      await this.admin
        .auth()
        .setCustomUserClaims(uid, { claims: { nominations: { nominator: true, approved: true } } });

      const nominator = await Nominator.findOneById(uid);

      nominator.disabled = false;
      nominator.nominationLimit = nominationLimit;
      nominator.emailVerified = true;

      await nominator.save();
    } catch (error) {
      throw new ApplicationError(error.message);
    }
  }

  async disableUser(uid) {
    try {
      await this.admin.auth().updateUser(uid, {
        disabled: true
      });

      const user = await Nominator.findOneById(uid);
      user.disabled = true;
    } catch (error) {
      throw new ApplicationError(error.message);
    }
  }

  async verifyUserEmail(rootUrl, { userId, confirmationCode }) {}

  async verifyUser(phoneNumber: string) {
    try {
      console.log(phoneNumber);
      const firebaseUser = await this.admin.auth().getUserByPhoneNumber(phoneNumber);
      console.log(firebaseUser);

      const user = await Nominator.findOneById(firebaseUser.uid);

      if (!user || !firebaseUser) {
        logger.warn('The user could not be found in the database or firebase.');

        throw new ApplicationError('user not found', ErrorCodes.UserNotFound);
      }
      const { disabled, emailVerified } = user;
      return { disabled, emailVerified };
    } catch (error) {
      throw new ApplicationError(error.message, ErrorCodes.UserNotFound);
    }
  }
}
